-- Drop old redundant tables (keeping the new catalog_* structure)
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS product_work_requirements CASCADE;
DROP TABLE IF EXISTS product_parameters CASCADE;
DROP TABLE IF EXISTS product_components CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_library CASCADE;
DROP TABLE IF EXISTS categories CASCADE;