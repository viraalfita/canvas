-- Unify image_edit and image_merge into a single image_generate node type.
-- The new image_generate node accepts an optional `image_input` handle (0+ images),
-- so existing edges remain valid after type conversion.
update public.nodes
   set type = 'image_generate'
 where type in ('image_edit', 'image_merge');
