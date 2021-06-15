DROP TABLE IF EXISTS maps;
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

DROP TABLE IF EXISTS complexities;
CREATE TABLE complexities (
  map_id varchar(32) not null,
  complexity int not null,
  complexity_name varchar(256)
);

DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id varchar(16) not null,
  creation_date timestamp not null,
  account_status char not null,
  username varchar(32) not null,
  email varchar(254) not null,
  email_status char not null,
  password bytea not null,
  password_updated timestamp not null
);d
