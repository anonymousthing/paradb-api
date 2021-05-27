DROP TABLE maps;
CREATE TABLE maps (
  id varchar(16) not null,
  title varchar(256) not null,
  artist varchar(256) not null,
  author varchar(256),
  uploader varchar(256) not null,
  description text,
  download_link text not null,
  album_art text
);

DROP TABLE complexities;
CREATE TABLE complexities (
  map_id varchar(32) not null,
  complexity int not null,
  complexity_name varchar(256)
);
