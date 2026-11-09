1.Scope 
The purpose of this UAT plan is to ensure that users can successfully use the main features of our quizlet application. We will focus on these 3 features:

Feature 1: User Registeration and login
-As a new user, i want to create an account and log in so that i can access my study materials.
-Acceptance Criteria: 
    * Users can successfully register with a valid username, email, and password.
    * Users can log in using their registered credentials.
    * Users may not login using incorrect credentials

Feature 2: Quiz Progress Tracking
-As a student , i want to track my quiz progress so that I can see whether my performance improves when I retake a quiz.
-Acceptance Criteria:
    * Users can view their progress after completing a quiz.
    * The progress bar updates to reflect the user's latest quiz performance.
    * Users can retake a quiz to check if their performance has improved
    * Users can view their saved progress after logging out and logging back in


Feature 3: Flshcard Creation and Saving
-As a student, I want create and save flashcards so that I can access them later whhen studying.
-Acceptance Criteria:
    * Users can create flashcards by entering a question and answer.
    * Users can save their flashcards to their accounts.
    * Users can access their saved flashcards after logging out and logging back in.
    * Users receive an error message when they attempt to save a flashcard without the required information.

3.Environment:
    * Our team will conduct UAT in a localhost environment using Docker. We will test our application through a web browser to confirm that registration, login, quiz progress tracking, and flashcard creation are all working appropriately.

4.Testers:
    * Our team members will perform UAT by testing the application from a student's perspective.
    * Tester ID:
         Tester ID | Features
        ------------------------------------
            T01    | Registration & Login
            T02    | Quiz Progress Tracking
            T03    | Flashcard Creation
Each tester will follow the planned test cases and the results will be recorded whether the feature passes or not. Any issues that develop during testing will be documented.

5.Test Cases:
Feature 1: Registration & Login
Test Case 1: Successful Registration & Login
    * Test ID: TC01
    Tester: T01
    Steps:
        -Open the application
        -Navigate to the registration page.
        -Enter valid username, email, password
        -Submit the registration form.
        -Navigate to the login page
        -Enter the registered username and password.
        -Click Login
    Expected Result: The user successfully creates an account and logs in.
    Actual result: Not run
    Status: Not run

