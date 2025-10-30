import express from 'express';
import { VtopController } from './vtopController.js';

const app = express();
const port = 3000;
app.use(express.json());

// Create one controller instance to manage the browser state
const controller = new VtopController();

/*
 * @route   GET /api/captcha
 * @desc    Initializes the browser and scrapes the login page for the CAPTCHA image.
 * This is the FIRST endpoint you must call.
 */
app.get('/api/captcha', async (req, res) => {
  try {
    const captchaBase64 = await controller.getCaptcha();
    // Returns the image as a Base64 string
    res.json({ captcha: captchaBase64 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/*
 * @route   POST /api/login
 * @desc    Attempts to log in using the user's credentials and the solved CAPTCHA.
 * @body    { "username": "...", "password": "...", "captcha": "..." }
 */
app.post('/api/login', async (req, res) => {
  const { username, password, captcha } = req.body;
  if (!username || !password || !captcha) {
    return res.status(400).json({ error: 'Username, password, and captcha are required.' });
  }

  try {
    const result = await controller.login(username, password, captcha);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/*
 * @route   POST /api/attendance
 * @desc    Fetches the attendance data for a specific semester.
 * @body    { "semesterID": "CH2020211" }
 */
app.post('/api/attendance', async (req, res) => {
  const { semesterID } = req.body;
  if (!semesterID) {
    return res.status(400).json({ error: 'semesterID is required.' });
  }

  try {
    const attendanceData = await controller.getAttendance(semesterID);
    res.json(attendanceData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add more endpoints here (e.g., /api/marks, /api/timetable)
// by copying the getAttendance() pattern.

app.listen(port, () => {
  console.log(`VTOP API server listening on http://localhost:${port}`);
});