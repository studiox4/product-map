ALTER TABLE "products" RENAME TO "projects";
ALTER TABLE "features" RENAME COLUMN "product_id" TO "project_id";
