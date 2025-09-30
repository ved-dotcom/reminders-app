-- Seed a Director account
-- Replace PASSWORD_HASH with a bcrypt hash you generate for your chosen password

INSERT INTO users (id, username, display_name, password_hash, status)
VALUES (
  gen_random_uuid(),
  'director',
  'Director',
  '$2a$12$abHgpxmc4aQdk2g7OpaXh.ay6s6jpyYxDXYq2hsTXHRuo6unqbo9O',
  'active'
);

INSERT INTO roles (id, name) VALUES (gen_random_uuid(), 'director');

INSERT INTO user_roles (id, user_id, role_id, granted_by)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM users WHERE username='director'),
  (SELECT id FROM roles WHERE name='director'),
  (SELECT id FROM users WHERE username='director')
);
