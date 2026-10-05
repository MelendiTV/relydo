-- RELYDO canonical service catalog
-- Mirrors the service catalog validated in TEST.

INSERT INTO public.services (name, slug, active)
VALUES
  ('A/C Rental', 'ac-rental', true),
  ('Appliance Repair', 'appliance-repair', true),
  ('Carpentry', 'carpentry', true),
  ('Carpet Cleaning', 'carpet-cleaning', true),
  ('Cleaning', 'cleaning', true),
  ('Concrete & Masonry', 'concrete-masonry', true),
  ('Doors & Windows', 'doors-windows', true),
  ('Drywall', 'drywall', true),
  ('Electrical', 'electrical', true),
  ('Fencing', 'fencing', true),
  ('Flooring', 'flooring', true),
  ('Furniture Assembly', 'furniture-assembly', true),
  ('Garage Doors', 'garage-doors', true),
  ('Handyman', 'handyman', true),
  ('HVAC', 'hvac', true),
  ('Junk Removal', 'junk-removal', true),
  ('Landscaping', 'landscaping', true),
  ('Locksmith', 'locksmith', true),
  ('Moving', 'moving', true),
  ('Other', 'other', true),
  ('Painting', 'painting', true),
  ('Pest Control', 'pest-control', true),
  ('Plumbing', 'plumbing', true),
  ('Pools & Spas', 'pools-spas', true),
  ('Pressure Washing', 'pressure-washing', true),
  ('Roofing', 'roofing', true),
  ('Tile', 'tile', true),
  ('TV & Smart Home', 'tv-smart-home', true)
ON CONFLICT (slug)
DO UPDATE SET
  name = EXCLUDED.name,
  active = EXCLUDED.active;
