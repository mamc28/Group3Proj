# Group3Proj

Team Number: 3
Team Name: 
Team Members: Jackson, Eric, Max, Travis, Amelia
Application Name: Scramble
Application Description: Quizlet/Study app
Audience: Students
Vision Statement: Making learning accessible and welcoming to students worldwide.
Communication Plan: Meet after class.
Use Case Diagram:
Wireframe:

## Repository layout

- `TeamMeetingLogs/` contains team meeting logs.
- `MilestoneSubmissions/` contains milestone submissions.
- `ProjectSourceCode/` contains the application source code and assets.
- `docker-compose.yaml`, `.env`, and `.gitignore` remain at the repository root.

## Running the application

From the repository root, run `docker compose up`. The Compose configuration starts
the application from `ProjectSourceCode/src` and initializes the database from
`ProjectSourceCode/src/init_data`.

## Running tests

From the repository root, install the test and application dependencies, then run
the test suite with its isolated database:

```sh
docker compose -p lab10-tests -f ProjectSourceCode/docker-compose.test.yaml run --rm --no-deps tests npm ci
docker compose -p lab10-tests -f ProjectSourceCode/docker-compose.test.yaml up --abort-on-container-exit --exit-code-from tests
```

The database initialization scripts run only when the `group-project` volume is
first created. If an existing database is missing login-related columns, apply
the schema updates to that volume with:

```sh
docker compose exec db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ; ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS last_login_date DATE;"'
```
