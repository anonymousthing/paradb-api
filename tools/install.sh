#!/bin/bash
sudo apt update

# Install apt sources
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -

# Install postgresql
sudo apt install git postgresql nodejs -y
sudo service postgresql start

# Install yarn and pm2
sudo npm install yarn -g
yarn global add pm2

# Clone repos
sudo mkdir /etc/paradb
sudo chown $USER /etc/paradb
cd /etc/paradb
git clone https://github.com/bitnimble/paradb-api.git
git clone https://github.com/bitnimble/paradb-api-schema.git
git clone https://github.com/bitnimble/obento.git

# Build schema
pushd paradb-api-schema
yarn
yarn build
popd

# Build FE
pushd obento
yarn
pushd src/pages
git clone https://github.com/bitnimble/paradb.git
cd paradb
yarn
popd
yarn build paradb
popd

# Set up backend
pushd paradb-api
yarn
mkdir fe
cp ../obento/dist/paradb/* .
sudo -u postgres createdb paradb
sudo -u postgres psql -d paradb -f db/init.sql

pm2 start ecosystem.config.yml

echo "ParaDB installed; set up environment variables in .env file and then run `pm2 start paradb` to start."
