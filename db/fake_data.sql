INSERT INTO maps
  (id, submission_date, title, artist, author, uploader, description, download_link, album_art)
VALUES
  ('1', timestamp '2021-06-01 00:00:00', 'All Star', 'Smash Mouth', 'anon', 'anon', 'All Star is the greatest hit of all time.', 'https://www.google.com', 'https://upload.wikimedia.org/wikipedia/en/3/30/Astro_lounge.png');

INSERT INTO complexities
  (map_id, complexity, complexity_name)
VALUES
  ('1', 1, 'anon''s Easy'),
  ('1', 2, 'Medium'),
  ('1', 3, 'This map has layers'),
  ('1', 5, 'Shrek is love, Shrek is life');
