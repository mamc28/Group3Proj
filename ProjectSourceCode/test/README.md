#LAB 10 Testing
#Registration Contract

**Endpoint:** POST /register
**Request:** Username, email, and password.

**Required fields:**
-Username must not be empty and cannot exceed 50 characters.
-Email must not be empty and cannot exceed 100 characters.
-Password must not be empty.

**Successful registration:**
-Creates one new user in the database.
-Hashes the password using bcrpyt.
-Returns HTTP 302 and redirects to '/login'.

**Invalid registration:**
-MIssing required fields return HTTP 400.
-The registration page displays an error message
-No user is created.

**Database columns:**
- 'username'
- 'email'
- 'password_hash'

##Running the tests
From the 'ProjectSourceCode' folder, run:
docker compose -p lab10-test -f docker-compose.test.yaml up --abort-on-containers-exit --exiit-code-from tests

##Tests Included
1. Welcome route test
2. Successful registration intergration test
3. Missing-password registration intergration test.
4. Registration validation unit test

##Test Data Cleanup
The registration tests create temporary users with randomly generated usernames.
The 'removeTestUser()' function deletes matching test users before and after each registration test.
This prevents duplicate test records and allows the tests to run repeatedly.

##Test Results
First completed 4 test run: 4 passing, 0 failing
Second four test run: 4 passing, 0 failing
