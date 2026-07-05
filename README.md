# Gringo Community

This is the starting foundation for the Gringo Community platform.

The main product direction is now an agent-powered community platform. The CRM remains in the project, but it is an internal service used by agents rather than the main product.

Current scope includes only:

- Node.js project setup
- Express server
- Clean folder structure
- Environment configuration
- Health check endpoint
- Google Sheets connection helper
- Google Sheets read test
- Contact model
- Contact validation
- Create Contact API endpoint
- Get Contacts API endpoint
- Minimal Contacts web interface
- Add Contact page
- Contact List page
- Edit existing contacts
- Archive contacts
- Search and filter contacts
- ContactHistory records for create, update, and archive actions
- Workers module
- Worker API and WorkerHistory
- Workers list, add, edit, archive, search, and filters
- Internal agent architecture placeholders
- Local Web Chat MVP
- `.env.example`
- `.gitignore`

It does not include hard deletion, authentication, WhatsApp, Telegram, LINE, payments, login, dashboards, notifications, AI provider calls, or channel integrations yet.

## Agent Architecture

The first user interaction flow is:

```text
User sends a message
-> Core AI Agent receives it
-> Knowledge Agent searches for an answer
-> CRM Agent stores the conversation if needed
-> Manager Agent creates daily summaries
-> Content Agent creates content from recurring questions
-> Content is published to community channels
```

Agent modules:

```text
src/modules/core-agent
src/modules/knowledge-agent
src/modules/crm-agent
src/modules/manager-agent
src/modules/content-agent
```

Each agent module currently contains only interfaces, services, and placeholders. See `docs/agent-architecture.md`.

## Web Chat MVP

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/chat.html
```

Send a message. The page calls:

```text
POST /api/chat/message
```

Example request:

```json
{
  "message": "Hi Gringo",
  "channel": "web",
  "channelUserId": "local-web-user"
}
```

Example response:

```json
{
  "reply": "I’m here with you. Tell me what you need help with, and we’ll take it step by step.",
  "category": "Other",
  "status": "FOUND"
}
```

The chat flow calls the Core Agent, Knowledge Agent, and CRM Agent. If Google Sheets is not configured, Gringo still replies locally, but conversation storage will not be saved.

## Requirements

Install Node.js version 20 or newer.

You can check your version by running:

```bash
node --version
```

## Local Setup

1. Install the project packages:

```bash
npm install
```

2. Create your local environment file:

```bash
copy .env.example .env
```

On Mac or Linux, use:

```bash
cp .env.example .env
```

3. Start the local server:

```bash
npm run dev
```

If you prefer the normal start command, use:

```bash
npm start
```

## Test The Server

After the server starts, open this address in your browser:

```text
http://localhost:3000/health
```

You should see a response like:

```json
{
  "status": "ok",
  "service": "gringo-community-api"
}
```

That means the project foundation is working.

## Run Automated Tests

After installing packages, run:

```bash
npm test
```

The test suite checks:

- Contact request validation
- Create Contact API behavior
- Get Contacts API behavior
- Validation error responses
- Invalid JSON error responses

## Google Sheets Setup

Google Sheets is the current database for Contacts and ContactHistory.

### Step 1: Create A Google Sheet

1. Open Google Sheets.
2. Create a new spreadsheet.
3. Name it `Gringo Platform`.
4. Create or rename tabs so you have these exact tabs:

```text
Contacts
ContactNotes
ContactHistory
```

5. In the `Contacts` tab, add the approved header row from `docs/crm-data-model-spec.md`.

The most important detail is that the first tab used by the API is now `Contacts`, not `CRM`.

Use these exact column names in the first row of the `Contacts` tab:

```text
contact_id | first_name | last_name | display_name | email | phone | whatsapp_id | telegram_id | telegram_username | line_id | preferred_channel | country | city | language | status | source | source_detail | interest | priority | assigned_to | next_follow_up_at | last_contacted_at | tags | ai_summary | ai_next_action | ai_opt_in | marketing_opt_in | data_consent | notes_count | history_count | created_at | updated_at | archived_at
```

In the `ContactHistory` tab, add this header row:

```text
history_id | contact_id | event_type | channel | direction | title | description | old_value | new_value | actor_type | actor_id | external_message_id | created_at
```

The `ContactNotes` tab is reserved for a future milestone.

### Step 2: Create A Google Cloud Project

1. Go to Google Cloud Console.
2. Create a new project.
3. Name it something like `Gringo Community`.
4. Open `APIs & Services`.
5. Open `Library`.
6. Search for `Google Sheets API`.
7. Click `Enable`.

### Step 3: Create A Service Account

1. In Google Cloud Console, open `IAM & Admin`.
2. Open `Service Accounts`.
3. Click `Create service account`.
4. Give it a name, for example `gringo-sheets-service`.
5. Finish creating it.
6. Open the new service account.
7. Go to the `Keys` tab.
8. Click `Add key`.
9. Choose `Create new key`.
10. Choose `JSON`.
11. Download the JSON file.

### Step 4: Share The Sheet With The Service Account

1. Open the downloaded JSON file.
2. Find the `client_email` value.
3. Open your Google Sheet.
4. Click `Share`.
5. Paste the service account email.
6. Give it `Editor` access.
7. Click `Send` or `Share`.

Editor access is required because Milestone 3 can create new contact rows.

### Step 5: Fill In Your `.env` File

Copy `.env.example` to `.env` if you have not already done it.

Then fill these values:

```text
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_CLIENT_EMAIL=
GOOGLE_SHEETS_PRIVATE_KEY=
GOOGLE_SHEETS_CONTACTS_SHEET_NAME=Contacts
GOOGLE_SHEETS_CONTACT_NOTES_SHEET_NAME=ContactNotes
GOOGLE_SHEETS_CONTACT_HISTORY_SHEET_NAME=ContactHistory
GOOGLE_SHEETS_WORKERS_SHEET_NAME=Workers
GOOGLE_SHEETS_WORKER_HISTORY_SHEET_NAME=WorkerHistory
```

Where to find them:

- `GOOGLE_SHEETS_SPREADSHEET_ID` is in your Google Sheet URL.
- `GOOGLE_SHEETS_CLIENT_EMAIL` comes from `client_email` in the JSON file.
- `GOOGLE_SHEETS_PRIVATE_KEY` comes from `private_key` in the JSON file.
- `GOOGLE_SHEETS_CONTACTS_SHEET_NAME` should stay `Contacts`.
- `GOOGLE_SHEETS_CONTACT_NOTES_SHEET_NAME` should stay `ContactNotes`.
- `GOOGLE_SHEETS_CONTACT_HISTORY_SHEET_NAME` should stay `ContactHistory`.
- `GOOGLE_SHEETS_WORKERS_SHEET_NAME` should stay `Workers`.
- `GOOGLE_SHEETS_WORKER_HISTORY_SHEET_NAME` should stay `WorkerHistory`.

The spreadsheet ID is the long part of the Google Sheet URL between `/d/` and `/edit`.

Keep the private key on one line in `.env`. The app will convert `\n` into real line breaks automatically.

## Test Google Sheets Connection

After filling in `.env`, run:

```bash
npm run test:sheets
```

If the connection works, you will see a message saying the Google Sheets connection works and how many rows were found.

If it fails, check:

- The Google Sheets API is enabled.
- The sheet was shared with the service account email.
- The spreadsheet ID is correct.
- The contacts tab name is exactly `Contacts`.
- The private key was copied correctly.

## Contacts API

The Contacts API supports create, list, search, filter, update, and archive actions.

Create a contact:

```text
POST http://localhost:3000/api/contacts
```

Get contacts:

```text
GET http://localhost:3000/api/contacts
```

Search and filter contacts:

```text
GET http://localhost:3000/api/contacts?search=daniel&status=new&source=manual&country=israel
```

Update a contact:

```text
PUT http://localhost:3000/api/contacts/:contactId
```

Archive a contact:

```text
POST http://localhost:3000/api/contacts/:contactId/archive
```

The create endpoint requires `first_name` and at least one contact method, such as email, phone, WhatsApp ID, Telegram ID, Telegram username, or Line ID.

Example minimum create contact request body:

```json
{
  "first_name": "Daniel",
  "email": "daniel@example.com"
}
```

You can test this with a tool like Postman, Insomnia, or any API client.

## Contacts Web Interface

After starting the server, open:

```text
http://localhost:3000/
```

Available pages:

- Add contact: `http://localhost:3000/add-contact.html`
- List contacts: `http://localhost:3000/contacts.html`

The Add Contact page saves new contacts through the existing API.

The Contact List page can:

- Search by name, phone, or email
- Filter by status
- Filter by source
- Filter by country
- Edit an existing contact
- Archive a contact

Both pages show loading states and error messages.

When a contact is created, updated, or archived, the app also creates a row in the `ContactHistory` tab.

## Workers Module

Set up the Workers Google Sheets tabs:

```bash
npm run setup:workers
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/workers.html
```

Available pages:

- Workers list: `http://localhost:3000/workers.html`
- Add worker: `http://localhost:3000/add-worker.html`
- Edit worker: open from the Edit button in the worker list

The Workers module can:

- Add a worker
- Edit a worker
- Archive a worker
- Search workers
- Filter workers by status, availability, nationality, profession, and city
- Write WorkerHistory records when a worker is created, updated, or archived

## Project Structure

```text
gringo-community/
|
|-- README.md
|-- package.json
|-- .env.example
|-- .gitignore
|
|-- scripts/
|   |-- testGoogleSheetsConnection.js
|   |-- setupWorkerSheets.js
|
|-- src/
|   |-- app.js
|   |-- server.js
|   |
|   |-- config/
|   |   |-- env.js
|   |   |-- googleSheets.js
|   |
|   |-- modules/
|   |   |-- contacts/
|   |       |-- contact.controller.js
|   |       |-- contactHistory.model.js
|   |       |-- contact.model.js
|   |       |-- contact.repository.js
|   |       |-- contact.routes.js
|   |       |-- contact.service.js
|   |       |-- contact.validation.js
|   |   |
|   |   |-- workers/
|   |       |-- worker.controller.js
|   |       |-- worker.model.js
|   |       |-- worker.repository.js
|   |       |-- worker.routes.js
|   |       |-- worker.service.js
|   |       |-- worker.validation.js
|   |       |-- workerHistory.model.js
|   |
|   |-- shared/
|   |   |-- errorHandler.js
|   |
|   |-- public/
|       |-- index.html
|       |-- add-contact.html
|       |-- contacts.html
|       |-- workers.html
|       |-- add-worker.html
|       |-- edit-worker.html
|       |-- styles.css
|       |-- contact-form.js
|       |-- contacts-list.js
|       |-- worker-form-fields.js
|       |-- worker-form.js
|       |-- workers-list.js
```

## Next Milestone

Milestone 7 will add the next approved Gringo platform capability.

Possible next steps:

- Add contact notes endpoint
- Add get-one-contact endpoint
- Add restore archived contact endpoint

Milestone 6 should only begin after Milestone 5 is approved.
