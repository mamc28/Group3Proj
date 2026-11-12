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
`ProjectSourceCode/src/init_data`. It installs the application workspace
dependencies into a persistent Docker volume before starting the server.

## Running tests

From the repository root, install the test and application dependencies, then run
the test suite with its isolated database:

```sh
docker compose -p lab10-tests -f ProjectSourceCode/docker-compose.test.yaml run --rm --no-deps tests npm ci
docker compose -p lab10-tests -f ProjectSourceCode/docker-compose.test.yaml up --abort-on-container-exit --exit-code-from tests
```

The database initialization scripts run only when the `group-project` volume is
first created. The web service waits for PostgreSQL, then reapplies the idempotent
schema scripts before starting, bringing existing volumes up to date without
removing data.

If you need to apply the schema updates manually, run:

```sh
docker compose exec -T web node migrateStudy.js
```

## Confidence ratings and spaced review

Reveal a card's answer, then select **Again**, **Hard**, **Good**, or **Easy**.
Ratings replace Next/Previous navigation and save before the next card appears.
The study view loads new and due cards; View all cards remains available for browsing.
When no cards are due, it shows the next review time and checks for due cards automatically.
Distraction-free studying uses the same queue and ratings.

New cards start with these review intervals:

| Rating | Next review |
| --- | --- |
| Again | 1 minute |
| Hard | 6 hours |
| Good | 1 day |
| Easy | 4 days |

Later Hard/Good/Easy ratings multiply the previous scheduled interval by 1.2/2/3,
respectively, with the initial intervals as minimums and 365 days as the maximum.
Again resets the interval to one minute. This is a simple interval scheduler,
not Anki's FSRS algorithm. Ratings are self-assessments: Again increments the
incorrect counter; the other ratings increment the correct counter.
Schedules and review history persist across visits; the displayed visit counter resets on reload.

New databases apply all schema scripts during initialization, and the web
service safely reapplies them on startup for existing databases. The tests apply
the review-history migration automatically to their isolated database. The suite
includes scheduler tests,
HTTP/database tests for persistence, ownership and retries, and jsdom interaction
tests. Native browser fullscreen and visual animation still require a browser check.

## Progress dashboard

Open **Progress** in the navigation or visit `/progress` while signed in. The page
shows new/due cards, reviews today, cards reviewed at least once, and self-reported
recall over the last 14 days. A daily activity chart has a table alternative, and
per-set coverage links back to studying. Recall is the percentage of saved ratings
that were Hard, Good, or Easy; it is not an objective test score or mastery estimate.

Dates follow the user's saved timezone (UTC if unavailable). Repeated ratings count
as separate reviews, while card coverage counts each card once. Statistics cover
current sets: deleting a card removes its progress and review history. This page
uses the existing progress and review-history tables; no additional migration is
needed beyond the study migration above.
