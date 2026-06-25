import { Hono } from 'hono';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  projects,
  memberships,
  projectFavorites,
  features,
  featureCollaborators,
  documents,
  comments,
  releases,
  activity,
  users,
} from '@productmap/db/schema';
import type { AuthEnv } from '../middleware/auth';
import type {
  DashboardResponse,
  DashboardProject,
  NextAction,
  MyWorkItem,
  DashboardActivityItem,
  FeatureStatus,
  Horizon,
  DocType,
  MemberRole,
} from '@productmap/shared';

const EMPTY: DashboardResponse = { projects: [], nextActions: [], myWork: [], activity: [] };

// GET /api/dashboard — user-scoped, cross-project home. Behind the global
// /api/* requireAuth gate, so c.get('currentUser') is set. NOT project-scoped.
//
// Goal #1 (isolation): the project-id set is resolved ONCE from the caller's
// memberships ∪ favorites — admins included, no "all projects". Every section
// then filters by inArray(projectId, pids), so non-member rows can't leak.
// Goal #2 (bounded queries): a fixed handful of set-based / grouped queries,
// never a per-project loop, regardless of project or feature count.
export const dashboardRoutes = new Hono<AuthEnv>().get('/', async (c) => {
  const user = c.get('currentUser');

  // (1,2) Project set = membership ∪ favorites. Resolved once, up front.
  const memberRows = await db
    .select({ projectId: memberships.projectId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, user.id));
  const favRows = await db
    .select({ projectId: projectFavorites.projectId })
    .from(projectFavorites)
    .where(eq(projectFavorites.userId, user.id));

  const roleByPid = new Map<string, MemberRole>(memberRows.map((r) => [r.projectId, r.role]));
  const favSet = new Set(favRows.map((r) => r.projectId));
  const pids = [...new Set<string>([...roleByPid.keys(), ...favSet])];
  if (pids.length === 0) return c.json(EMPTY);

  const todayStr = new Date().toISOString().slice(0, 10);

  // (3) Project rows — exclude archived projects so every downstream section
  // (activity, featureAgg, releases, myWork, nextActions) is automatically
  // scoped to ACTIVE projects only. We rebuild the effective pids from the
  // surviving rows so the original candidate set (memberships ∪ favorites)
  // never lets archived projects leak into any section.
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .where(and(inArray(projects.id, pids), isNull(projects.archivedAt)));
  // Rebuild pids from non-archived project rows so all sections below use it.
  const activePids = projectRows.map((p) => p.id);
  if (activePids.length === 0) return c.json(EMPTY);
  const slugByPid = new Map(projectRows.map((p) => [p.id, p.slug ?? '']));

  // (4) Status rollup + staleCount, one grouped scan over features in scope.
  const featureAgg = await db
    .select({
      projectId: features.projectId,
      idea: sql<number>`count(*) filter (where ${features.status} = 'idea')::int`,
      planned: sql<number>`count(*) filter (where ${features.status} = 'planned')::int`,
      in_progress: sql<number>`count(*) filter (where ${features.status} = 'in_progress')::int`,
      shipped: sql<number>`count(*) filter (where ${features.status} = 'shipped')::int`,
      stale: sql<number>`count(*) filter (where ${features.endDate} < ${todayStr} and ${features.status} <> 'shipped')::int`,
    })
    .from(features)
    .where(and(inArray(features.projectId, activePids), isNull(features.archivedAt)))
    .groupBy(features.projectId);
  const aggByPid = new Map(featureAgg.map((a) => [a.projectId, a]));

  // (5) Next release per project: earliest non-shipped release by target date.
  // DISTINCT ON keeps this a single set-based query across all projects.
  const releaseRows = await db
    .select({
      id: releases.id,
      projectId: releases.projectId,
      name: releases.name,
      date: releases.targetDate,
    })
    .from(releases)
    .where(and(inArray(releases.projectId, activePids), eq(releases.status, 'planned')))
    .orderBy(
      releases.projectId,
      sql`${releases.targetDate} asc nulls last`,
      releases.id,
    );
  const nextReleaseByPid = new Map<string, { id: string; name: string; date: string | null }>();
  for (const r of releaseRows) {
    if (!nextReleaseByPid.has(r.projectId)) {
      nextReleaseByPid.set(r.projectId, { id: r.id, name: r.name, date: r.date });
    }
  }

  const dashboardProjects: DashboardProject[] = projectRows
    .map((p) => {
      const agg = aggByPid.get(p.id);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug ?? '',
        role: roleByPid.get(p.id) ?? 'viewer',
        favorite: favSet.has(p.id),
        counts: {
          idea: agg?.idea ?? 0,
          planned: agg?.planned ?? 0,
          in_progress: agg?.in_progress ?? 0,
          shipped: agg?.shipped ?? 0,
        },
        nextRelease: nextReleaseByPid.get(p.id) ?? null,
        staleCount: agg?.stale ?? 0,
      };
    })
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));

  // (6) myWork: features the caller collaborates on, across the project set.
  // Also carry start/end dates so feature_missing_dates is derived in JS below
  // (no extra query, no duplicate fetch of the same rows).
  const myWorkRows = await db
    .select({
      featureId: features.id,
      projectId: features.projectId,
      title: features.title,
      status: features.status,
      horizon: features.horizon,
      startDate: features.startDate,
      endDate: features.endDate,
    })
    .from(featureCollaborators)
    .innerJoin(features, eq(featureCollaborators.featureId, features.id))
    .where(and(eq(featureCollaborators.userId, user.id), inArray(features.projectId, activePids), isNull(features.archivedAt)))
    .orderBy(features.createdAt);
  const myWork: MyWorkItem[] = myWorkRows.map((w) => ({
    featureId: w.featureId,
    projectId: w.projectId,
    projectSlug: slugByPid.get(w.projectId) ?? '',
    title: w.title,
    status: w.status as FeatureStatus,
    horizon: w.horizon as Horizon,
  }));
  const myFeatureIds = new Set(myWork.map((w) => w.featureId));

  // (7) nextActions — honest, sourced, deep-linkable.
  const nextActions: NextAction[] = [];

  // 7a) doc_in_review: in_review docs (NOT draft) the caller authored OR on a
  // feature they collaborate on. One query; involvement filtered in SQL.
  const reviewDocRows = await db
    .select({
      documentId: documents.id,
      projectId: documents.projectId,
      featureId: documents.featureId,
      title: documents.title,
      type: documents.type,
      createdBy: documents.createdBy,
    })
    .from(documents)
    .where(
      and(
        inArray(documents.projectId, activePids),
        eq(documents.status, 'in_review'),
        or(
          eq(documents.createdBy, user.id),
          inArray(
            documents.featureId,
            db
              .select({ id: featureCollaborators.featureId })
              .from(featureCollaborators)
              .where(eq(featureCollaborators.userId, user.id)),
          ),
        ),
      ),
    );
  for (const d of reviewDocRows) {
    if (!d.featureId) continue; // in_review docs are feature-owned; guard anyway
    nextActions.push({
      kind: 'doc_in_review',
      projectId: d.projectId,
      projectSlug: slugByPid.get(d.projectId) ?? '',
      documentId: d.documentId,
      featureId: d.featureId,
      title: d.title,
      docType: d.type as DocType,
    });
  }

  // 7b) feature_missing_dates: collaborated features (in scope) missing a start
  // or end date. Derived from myWorkRows already loaded above — no extra query.
  for (const f of myWorkRows) {
    if (!f.startDate || !f.endDate) {
      nextActions.push({
        kind: 'feature_missing_dates',
        projectId: f.projectId,
        projectSlug: slugByPid.get(f.projectId) ?? '',
        featureId: f.featureId,
        title: f.title,
      });
    }
  }

  // 7c) open_comment: unresolved root comment threads on the caller's
  // collaborated features (and their docs), grouped + counted. Scoped to the
  // myWork feature set so it's both relevant and bounded.
  if (myFeatureIds.size > 0) {
    const featureIdOfComment = sql<string>`coalesce(${comments.featureId}, ${documents.featureId})`;
    const openRows = await db
      .select({
        featureId: featureIdOfComment,
        projectId: sql<string>`${features.projectId}`,
        title: sql<string>`${features.title}`,
        count: sql<number>`count(*)::int`,
      })
      .from(comments)
      .leftJoin(documents, eq(comments.documentId, documents.id))
      .innerJoin(features, eq(featureIdOfComment, features.id))
      .where(
        and(
          isNull(comments.parentId),
          isNull(comments.resolvedAt),
          inArray(featureIdOfComment, [...myFeatureIds]),
        ),
      )
      .groupBy(featureIdOfComment, features.projectId, features.title);
    for (const r of openRows) {
      nextActions.push({
        kind: 'open_comment',
        source: 'collaborating',
        projectId: r.projectId,
        projectSlug: slugByPid.get(r.projectId) ?? '',
        featureId: r.featureId,
        title: r.title,
        count: r.count,
      });
    }
  }

  // (8) activity: cross-project feed, newest first, capped.
  const activityRows = await db
    .select({
      id: activity.id,
      featureId: activity.featureId,
      featureTitle: features.title,
      projectId: activity.projectId,
      actorId: activity.actorId,
      actorName: users.name,
      actorColor: users.color,
      kind: activity.kind,
      payload: activity.payload,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .innerJoin(users, eq(activity.actorId, users.id))
    .innerJoin(features, eq(activity.featureId, features.id))
    .where(inArray(activity.projectId, activePids))
    .orderBy(desc(activity.createdAt), desc(activity.id))
    .limit(200);
  const dashboardActivity: DashboardActivityItem[] = activityRows.map((a) => ({
    id: a.id,
    featureId: a.featureId,
    featureTitle: a.featureTitle,
    projectId: a.projectId ?? '',
    projectSlug: slugByPid.get(a.projectId ?? '') ?? '',
    actorId: a.actorId,
    actorName: a.actorName,
    actorColor: a.actorColor,
    kind: a.kind as DashboardActivityItem['kind'],
    payload: a.payload as Record<string, unknown> | null,
    createdAt: a.createdAt.toISOString(),
  }));

  const response: DashboardResponse = {
    projects: dashboardProjects,
    nextActions,
    myWork,
    activity: dashboardActivity,
  };
  return c.json(response);
});
