function createWorkerFormFields(container) {
  container.innerHTML = `
    <label><span>First name</span><input name="first_name" required></label>
    <label><span>Last name</span><input name="last_name"></label>
    <label><span>Nickname</span><input name="nickname"></label>
    <label><span>Nationality</span><input name="nationality" required></label>
    <label><span>Native language</span><input name="native_language"></label>
    <label><span>Phone</span><input name="phone"></label>
    <label><span>WhatsApp</span><input name="whatsapp"></label>
    <label><span>Telegram</span><input name="telegram"></label>
    <label><span>Line</span><input name="line"></label>
    <label><span>Passport number</span><input name="passport_number"></label>
    <label><span>Visa type</span><select name="visa_type">
      <option value="unknown">Unknown</option>
      <option value="tourist">Tourist</option>
      <option value="work">Work</option>
      <option value="student">Student</option>
      <option value="resident">Resident</option>
      <option value="refugee">Refugee</option>
      <option value="none">None</option>
      <option value="other">Other</option>
    </select></label>
    <label><span>Visa expiration</span><input name="visa_expiration" type="date"></label>
    <label><span>Profession</span><input name="profession"></label>
    <label><span>Years of experience</span><input name="years_experience" type="number" min="0" max="80" step="1"></label>
    <label><span>Current employer</span><input name="current_employer"></label>
    <label><span>Current city</span><input name="current_city"></label>
    <label><span>Availability</span><select name="availability">
      <option value="unknown">Unknown</option>
      <option value="immediate">Immediate</option>
      <option value="this_week">This week</option>
      <option value="this_month">This month</option>
      <option value="unavailable">Unavailable</option>
    </select></label>
    <label><span>Status</span><select name="status">
      <option value="new">New</option>
      <option value="screening">Screening</option>
      <option value="ready">Ready</option>
      <option value="working">Working</option>
      <option value="inactive">Inactive</option>
      <option value="not_eligible">Not eligible</option>
      <option value="archived">Archived</option>
    </select></label>
    <label class="wide"><span>Skills</span><input name="skills" placeholder="construction, cleaning, cooking"></label>
    <label class="wide"><span>Previous employers</span><input name="previous_employers"></label>
    <label class="wide"><span>Documents</span><input name="documents" placeholder="Passport scan, visa file link"></label>
    <label class="wide"><span>Tags</span><input name="tags" placeholder="urgent, english, experienced"></label>
    <label class="wide"><span>Notes</span><textarea name="notes" rows="5"></textarea></label>
  `;
}
