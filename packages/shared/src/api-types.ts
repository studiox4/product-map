import type { Horizon, FeatureStatus, DocType, DocStatus } from './constants';

export interface Product { id: string; name: string; vision: string; aboutMd: string; }
export interface Feature {
  id: string; productId: string; title: string; horizon: Horizon; status: FeatureStatus;
  startDate: string | null; endDate: string | null; sortOrder: number;
  createdAt: string; updatedAt: string;
}
export interface DocumentMeta {
  id: string; featureId: string; type: DocType; title: string; status: DocStatus;
  createdAt: string; updatedAt: string;
}
export interface DocumentFull extends DocumentMeta { contentJson: unknown; contentMd: string; }
export interface FeatureWithDocs extends Feature { documents: DocumentMeta[]; }
export type AttentionItem =
  | { kind: 'draft_doc' | 'in_review_doc'; documentId: string; featureId: string; title: string; docType: DocType }
  | { kind: 'missing_dates' | 'no_docs'; featureId: string; title: string };
export interface OverviewResponse {
  product: Product;
  features: FeatureWithDocs[];
  attention: AttentionItem[];
}
