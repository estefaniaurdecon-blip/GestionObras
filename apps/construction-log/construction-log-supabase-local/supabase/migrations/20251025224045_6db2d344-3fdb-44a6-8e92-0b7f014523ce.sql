-- Increase max_users by 5 for Urdecon organization
UPDATE organizations 
SET max_users = max_users + 5 
WHERE id = 'f9387ee5-f5fe-43b9-a8d4-ed45c3b2625f';