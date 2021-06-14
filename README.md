## Installation

```
# Clone and install deps
git clone https://github.com/anonymousthing/paradb-api.git
cd paradb-api
yarn

# Install and start postgres
sudo apt install postgresql
sudo service postgresql start

# Create postgres user for yourself
sudo -u postgres createuser --interactive --pwprompt

# Edit .env to fill out your username and password!

# Create db and instantiate schema
createdb paradb
db/init.sh

# Create symlink from "fe" to the actual frontend dist directory
ln -s /path/to/obento2/dist/paradb fe

# Start server
yarn start
```
