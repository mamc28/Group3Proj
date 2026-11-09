const router = require('express').Router();
const { db } = require('./db');
const { randomBytes, timingSafeEqual } = require('node:crypto');

// -----------------------------------------------------------------------------
// CSRF protection
// -----------------------------------------------------------------------------

router.use((req, res, next) => {
    if (!req.session.examCsrf) {
        req.session.examCsrf = randomBytes(32).toString('hex');
    }

    res.locals.csrfToken = req.session.examCsrf;

    // Validate the CSRF token on every POST request.
    if (req.method === 'POST') {
        const token = typeof req.body.csrfToken === 'string'
            ? req.body.csrfToken
            : '';

        const expected = Buffer.from(req.session.examCsrf);
        const submitted = Buffer.from(token);

        if (
            submitted.length !== expected.length ||
            !timingSafeEqual(submitted, expected)
        ) {
            return res.status(403).send(
                'Your form has expired. Reload the page and try again.'
            );
        }
    }

    next();
});

// -----------------------------------------------------------------------------
// Route parameter validation
// -----------------------------------------------------------------------------

router.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) {
        return res.status(404).send('Exam not found.');
    }

    next();
});

// -----------------------------------------------------------------------------
// Validation and formatting helpers
// -----------------------------------------------------------------------------

function validateExam(formData) {
    const errors = [];

    if (!formData.title) {
        errors.push('An exam title is required.');
    } else if (formData.title.length > 150) {
        errors.push('The exam title cannot exceed 150 characters.');
    }

    if (formData.course.length > 100) {
        errors.push('The course name cannot exceed 100 characters.');
    }

    if (!formData.exam_date) {
        errors.push('An exam date is required.');
    } else {
        // Check both the date's format and whether it is a real calendar date.
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        const parsedDate = new Date(`${formData.exam_date}T00:00:00Z`);

        if (
            !datePattern.test(formData.exam_date) ||
            Number.isNaN(parsedDate.getTime()) ||
            parsedDate.toISOString().slice(0, 10) !== formData.exam_date
        ) {
            errors.push('Please enter a valid exam date.');
        }
    }

    if (
        formData.start_time &&
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(formData.start_time)
    ) {
        errors.push('Please enter a valid exam time.');
    }

    if (formData.location.length > 150) {
        errors.push('The location cannot exceed 150 characters.');
    }

    if (formData.description.length > 5000) {
        errors.push('The description cannot exceed 5,000 characters.');
    }

    return errors;
}

function getFormData(body) {
    return {
        title: typeof body.title === 'string' ? body.title.trim() : '',
        course: typeof body.course === 'string' ? body.course.trim() : '',
        exam_date: typeof body.exam_date === 'string' ? body.exam_date.trim() : '',
        start_time: typeof body.start_time === 'string' ? body.start_time.trim() : '',
        location: typeof body.location === 'string' ? body.location.trim() : '',
        description: typeof body.description === 'string'
            ? body.description.trim()
            : ''
    };
}

// -----------------------------------------------------------------------------
// Database helpers
// -----------------------------------------------------------------------------

async function getExamLists(userId) {
    // The user's timezone determines whether an exam is considered upcoming
    // or past. The exam's stored DATE and TIME are not converted.
    const upcomingExams = await db.any(
        `SELECT
            e.*,
            TO_CHAR(e.exam_date, 'FMMonth FMDD, YYYY') AS display_date,
            TO_CHAR(e.start_time, 'FMHH12:MI AM') AS display_time,
            TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date_value,
            TO_CHAR(e.start_time, 'HH24:MI') AS start_time_value
         FROM exams e
         JOIN users u ON u.user_id = e.user_id
         WHERE e.user_id = $1
           AND e.exam_date >= (
               CURRENT_TIMESTAMP AT TIME ZONE
               COALESCE(NULLIF(u.timezone, ''), 'UTC')
           )::date
         ORDER BY e.exam_date ASC, e.start_time ASC NULLS LAST, e.exam_id ASC`,
        [userId]
    );

    const pastExams = await db.any(
        `SELECT
            e.*,
            TO_CHAR(e.exam_date, 'FMMonth FMDD, YYYY') AS display_date,
            TO_CHAR(e.start_time, 'FMHH12:MI AM') AS display_time,
            TO_CHAR(e.exam_date, 'YYYY-MM-DD') AS exam_date_value,
            TO_CHAR(e.start_time, 'HH24:MI') AS start_time_value
         FROM exams e
         JOIN users u ON u.user_id = e.user_id
         WHERE e.user_id = $1
           AND e.exam_date < (
               CURRENT_TIMESTAMP AT TIME ZONE
               COALESCE(NULLIF(u.timezone, ''), 'UTC')
           )::date
         ORDER BY e.exam_date DESC, e.start_time DESC NULLS LAST, e.exam_id DESC`,
        [userId]
    );

    return { upcomingExams, pastExams };
}

async function renderExams(req, res, options = {}) {
    const { upcomingExams, pastExams } = await getExamLists(
        req.session.user.user_id
    );

    res.render('pages/exams', {
        title: 'Exams | scramble.',
        upcomingExams,
        pastExams,
        ...options
    });
}

// -----------------------------------------------------------------------------
// GET /exams
// Display upcoming and past exams.
// -----------------------------------------------------------------------------

router.get('/', async (req, res) => {
    try {
        await renderExams(req, res);
    } catch (error) {
        console.error('Error loading exams:', error);
        res.status(500).send('Unable to load exams.');
    }
});

// -----------------------------------------------------------------------------
// POST /exams
// Create a new exam.
// -----------------------------------------------------------------------------

router.post('/', async (req, res) => {
    const formData = getFormData(req.body);
    const errors = validateExam(formData);

    if (errors.length > 0) {
        try {
            return await renderExams(req, res, {
                errors,
                formData
            });
        } catch (error) {
            console.error('Error reloading exams after validation:', error);
            return res.status(500).send('Unable to load exams.');
        }
    }

    try {
        await db.none(
            `INSERT INTO exams (
                user_id,
                title,
                course,
                exam_date,
                start_time,
                location,
                description
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                req.session.user.user_id,
                formData.title,
                formData.course || null,
                formData.exam_date,
                formData.start_time || null,
                formData.location || null,
                formData.description || null
            ]
        );

        res.redirect('/exams');
    } catch (error) {
        console.error('Error creating exam:', error);
        res.status(500).send('Unable to create exam.');
    }
});

// -----------------------------------------------------------------------------
// GET /exams/:id/edit
// Display the exam form with the selected exam's information.
// -----------------------------------------------------------------------------

router.get('/:id/edit', async (req, res) => {
    try {
        const exam = await db.oneOrNone(
            `SELECT
                exam_id,
                title,
                course,
                exam_date,
                start_time,
                location,
                description,
                TO_CHAR(exam_date, 'YYYY-MM-DD') AS exam_date_value,
                TO_CHAR(start_time, 'HH24:MI') AS start_time_value
             FROM exams
             WHERE exam_id = $1 AND user_id = $2`,
            [req.params.id, req.session.user.user_id]
        );

        if (!exam) {
            return res.status(404).send('Exam not found.');
        }

        // Use the formatted date/time values in the HTML form.
        const formData = {
            title: exam.title,
            course: exam.course || '',
            exam_date: exam.exam_date_value,
            start_time: exam.start_time_value || '',
            location: exam.location || '',
            description: exam.description || ''
        };

        await renderExams(req, res, {
            editingExam: exam,
            formData
        });
    } catch (error) {
        console.error('Error loading exam for editing:', error);
        res.status(500).send('Unable to load exam.');
    }
});

// -----------------------------------------------------------------------------
// POST /exams/:id/edit
// Update an existing exam.
// -----------------------------------------------------------------------------

router.post('/:id/edit', async (req, res) => {
    const formData = getFormData(req.body);
    const errors = validateExam(formData);

    if (errors.length > 0) {
        try {
            const exam = await db.oneOrNone(
                `SELECT exam_id FROM exams
                 WHERE exam_id = $1 AND user_id = $2`,
                [req.params.id, req.session.user.user_id]
            );

            if (!exam) {
                return res.status(404).send('Exam not found.');
            }

            return await renderExams(req, res, {
                editingExam: exam,
                formData,
                errors
            });
        } catch (error) {
            console.error('Error reloading exam after validation:', error);
            return res.status(500).send('Unable to load exam.');
        }
    }

    try {
        const result = await db.result(
            `UPDATE exams
             SET
                title = $1,
                course = $2,
                exam_date = $3,
                start_time = $4,
                location = $5,
                description = $6,
                updated_at = CURRENT_TIMESTAMP
             WHERE exam_id = $7 AND user_id = $8`,
            [
                formData.title,
                formData.course || null,
                formData.exam_date,
                formData.start_time || null,
                formData.location || null,
                formData.description || null,
                req.params.id,
                req.session.user.user_id
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Exam not found.');
        }

        res.redirect('/exams');
    } catch (error) {
        console.error('Error updating exam:', error);
        res.status(500).send('Unable to update exam.');
    }
});

// -----------------------------------------------------------------------------
// POST /exams/:id/delete
// Delete an exam.
// -----------------------------------------------------------------------------

router.post('/:id/delete', async (req, res) => {
    try {
        const result = await db.result(
            `DELETE FROM exams
             WHERE exam_id = $1 AND user_id = $2`,
            [req.params.id, req.session.user.user_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).send('Exam not found.');
        }

        res.redirect('/exams');
    } catch (error) {
        console.error('Error deleting exam:', error);
        res.status(500).send('Unable to delete exam.');
    }
});

module.exports = router;