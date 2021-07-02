CREATE TABLE maps (
  id varchar(16) primary key,
  submission_date timestamp not null,
  title varchar(256) not null,
  artist varchar(256) not null,
  author varchar(256),
  uploader varchar(256) not null,
  description text,
  download_link text not null,
  album_art text
);

CREATE TABLE complexities (
  map_id varchar(32) references maps (id) not null,
  complexity int not null,
  complexity_name varchar(256)
);

CREATE TABLE users (
  id varchar(16) primary key,
  creation_date timestamp not null,
  account_status char not null,
  username varchar(32) unique not null,
  email varchar(254) unique not null,
  email_status char not null,
  password bytea not null,
  password_updated timestamp not null
);
