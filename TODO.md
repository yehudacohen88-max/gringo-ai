# TODO

## Before Milestone 7

- Confirm Google Sheet has the approved `Contacts` header row.
- Confirm Google Sheet has the approved `ContactHistory` header row.
- Run `npm run setup:workers` to create/update `Workers` and `WorkerHistory`.
- Run the test suite locally after Node.js is installed.
- Run the Google Sheets connection test with real credentials.
- Open the Add Contact page and save one real test contact.
- Open the Contact List page and confirm the test contact appears.
- Edit one contact and confirm the row updates in Google Sheets.
- Archive one contact and confirm it is hidden from the active list.
- Confirm created, updated, and archived events appear in `ContactHistory`.
- Add one worker and confirm the row appears in `Workers`.
- Edit one worker and confirm a `worker_updated` row appears in `WorkerHistory`.
- Archive one worker and confirm a `worker_archived` row appears in `WorkerHistory`.

## Future Milestones

- Add employers/jobs module.
- Match workers to job opportunities.
- Add ContactNotes endpoints.
- Add get-one-contact endpoint.
- Add restore archived contact endpoint.
- Add duplicate detection for email, phone, and messaging IDs.
- Add authentication before exposing the API publicly.
- Consider migrating from Google Sheets to PostgreSQL when usage grows.
