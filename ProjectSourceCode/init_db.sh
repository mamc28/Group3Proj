#!/bin/bash

# DO NOT PUSH THIS FILE TO GITHUB
# This file contains sensitive information and should be kept private

# TODO: Set your PostgreSQL URI - Use the External Database URL from the Render dashboard
PG_URI="postgresql://users_db_8a8p_user:eejkOMId2dWzLS78Ve4Dp64HuiNlxbxH@dpg-dbvip1vlk1mc73drmdpg-a.oregon-postgres.render.com/users_db_8a8p"

# Execute each .sql file in the directory
for file in src/init_data/*.sql; do
    echo "Executing $file..."
    psql $PG_URI -f "$file"
done