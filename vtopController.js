import puppeteer from 'puppeteer';

// This is the VTOP base URL
const VTOP_BASE_URL = 'https://vtopcc.vit.ac.in/vtop';

export class VtopController {
  constructor() {
    this.browser = null;
    this.page = null;
    this.csrfToken = null; // We'll store the CSRF token here after login
  }

  // Initializes the headless browser
  async initialize() {
    if (this.browser) return; // Already initialized
    this.browser = await puppeteer.launch({ headless: true });
    this.page = await this.browser.newPage();
    
    // We set the User-Agent to match the one from the Java code
    // This is important to avoid being blocked
    await this.page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1');
  }

  // --- 1. GET CAPTCHA ---
  // Replicates the `getCaptcha()` function from the Java code
  async getCaptcha() {
    await this.initialize();
    await this.page.goto(`${VTOP_BASE_URL}/login`, { waitUntil: 'networkidle0' });

    [cite_start]// This is the *exact* JS logic from the Java file [cite: 85]
    const result = await this.page.evaluate(() => {
      return {
        captcha: $('#captchaBlock img').get(0).src
      };
    });

    [cite_start]// The Java code splits the Base64 string, so we do too [cite: 86]
    return result.captcha.split(',')[1];
  }

  // --- 2. LOGIN ---
  // Replicates the `signIn(String captcha)` function
  async login(username, password, captcha) {
    if (!this.page) {
      throw new Error('Browser not initialized. Call /api/captcha first.');
    }

    [cite_start]// This JS is a direct translation of the `signIn` function's evaluateJavascript call [cite: 100-119]
    const result = await this.page.evaluate(async (user, pass, cap) => {
      
      // We are *inside* the VTOP page's context here.
      // We can use the $ (JQuery) a.k.a. the `$` function because VTOP's page loads it.
      $('#vtopLoginForm [name="username"]').val(user);
      $('#vtopLoginForm [name="password"]').val(pass);
      $('#vtopLoginForm [name="captchaStr"]').val(cap);
      
      // We use 'await' on a new Promise to handle the async $.ajax call
      return new Promise((resolve, reject) => {
        $.ajax({
          type: 'POST',
          url: '/vtop/login',
          data: $('#vtopLoginForm').serialize(),
          async: true, // We can be async, unlike the Java code's 'async: false'
          success: function(res) {
            let response = {
              authorised: false,
              error_message: null,
              _csrf: null // We add this to scrape the token!
            };

            if (res.includes('authorizedIDX')) {
              response.authorised = true;
              // CRITICAL: Scrape the CSRF token for future requests
              // This is the key we discussed. We find it in the new page's HTML.
              const doc = new DOMParser().parseFromString(res, 'text/html');
              response._csrf = doc.querySelector('input[name="_csrf"]').value;
              resolve(response);
              return;
            }

            [cite_start]// This is the same error-checking logic from the Java file [cite: 109-118]
            const pageContent = res.toLowerCase();
            if (new RegExp(/invalid\s*captcha/).test(pageContent)) {
              response.error_message = 'Invalid Captcha';
            } else if (new RegExp(/invalid\s*(user\s*name|login\s*id|user\s*id)\s*\/\s*password/).test(pageContent)) {
              response.error_message = 'Invalid Username / Password';
            } else {
              response.error_message = 'Unknown login error';
            }
            resolve(response);
          },
          error: function(err) {
            reject(new Error('AJAX request failed'));
          }
        });
      });

    }, username, password, captcha); // Pass variables into the evaluate function

    if (result.authorised) {
      // Login success! Save the CSRF token to our class instance.
      this.csrfToken = result._csrf;
      // We also need to "confirm" the navigation so the page context is correct
      await this.page.goto(`${VTOP_BASE_URL}/content`, { waitUntil: 'networkidle0' });
    }
    
    return result;
  }

  // --- 3. GET ATTENDANCE ---
  // Replicates the `downloadAttendance()` function
  async getAttendance(semesterID) {
    if (!this.page || !this.csrfToken) {
      throw new Error('Not logged in. Call /api/login first.');
    }

    [cite_start]// This JS is a direct translation of `downloadAttendance` [cite: 288-304]
    const result = await this.page.evaluate(async (semID, csrf) => {
      
      [cite_start]// Build the data string, just like the Java code [cite: 289]
      const data = `_csrf=${csrf}&semesterSubId=${semID}&authorizedID=${$('#authorizedIDX').val()}`;
      
      return new Promise((resolve, reject) => {
        $.ajax({
          type: 'POST',
          url: 'processViewStudentAttendance', // Puppeteer knows the base URL
          data: data,
          async: true,
          success: function(res) {
            [cite_start]// This is the HTML parser from the Java code [cite: 291-304]
            const doc = new DOMParser().parseFromString(res, 'text/html');
            const table = doc.getElementById('getStudentDetails');
            const headings = table.getElementsByTagName('th');
            let response = { attendance: [] };
            
            let slotIndex, attendedIndex, totalIndex, percentageIndex;
            for (let i = 0; i < headings.length; ++i) {
              let heading = headings[i].innerText.toLowerCase();
              if (heading.includes('slot')) slotIndex = i;
              else if (heading.includes('attended')) attendedIndex = i;
              else if (heading.includes('total')) totalIndex = i;
              else if (heading.includes('percentage')) percentageIndex = i;
            }

            const cells = table.getElementsByTagName('td');
            while (slotIndex < cells.length) {
              let attendanceObject = {};
              attendanceObject.slot = cells[slotIndex].innerText.trim().split('+')[0].trim();
              attendanceObject.attended = parseInt(cells[attendedIndex].innerText.trim()) || 0;
              attendanceObject.total = parseInt(cells[totalIndex].innerText.trim()) || 0;
              attendanceObject.percentage = parseInt(cells[percentageIndex].innerText.trim()) || 0;
              response.attendance.push(attendanceObject);
              
              slotIndex += headings.length;
              attendedIndex += headings.length;
              totalIndex += headings.length;
              percentageIndex += headings.length;
            }
            resolve(response);
          },
          error: function(err) {
            reject(new Error('AJAX request failed'));
          }
        });
      });

    }, semesterID, this.csrfToken); // Pass variables into the evaluate function

    return result;
  }
}