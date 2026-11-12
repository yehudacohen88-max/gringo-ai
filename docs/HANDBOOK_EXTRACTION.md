# Handbook extraction attempt (Thai, Hindi, Sinhala)

Retrieval date of the PDFs: 2026-11-11. No quote from these languages was accepted. All 10 drafts in Thai, Hindi, and Sinhala stay `extraction_unreliable` (no quote, no answer). Hebrew and English drafts are unchanged and still use the `pdftotext -layout` files.

## Methods tried (free, local)

| Method | Tool | Result |
| --- | --- | --- |
| Text layer | `pdftotext -layout` (Poppler 24.02), already committed | Thai vowels reordered (`ทางาน`, zero `ทำงาน`). Hindi legacy font (`पासपोटा`). Sinhala mostly `ඊශ්‍රොයල` (139) rather than a correct Israel spelling. |
| Text layer | `mutool draw -F txt` (MuPDF 1.23) | Same failures. Thai key term `ทำงาน` count 0. Hindi `पासपोटा` still present. Sinhala garbled form 139. |
| Text layer | PyMuPDF `get_text` | Thai: after one documented repair, consonant + space + `า` → sara am, the text has `ทำงาน` 158, `ทางาน` 0, `นายจ้าง` 166, `หนังสือเดินทาง` 6, `อิสราเอล` 160, and the figures `12.5`, `6,443`, and `36`. Hindi: `इज़राइल` 118 but passport is still `पासपोटा` (245 occurrences of that stem), `वेतन` 0, `नियोक्ता` 0. Sinhala: correct-looking `ඊශ්‍රායල` only 6 times, garbled `ඊශ්‍රොයල` 139 times. |
| OCR | Tesseract 5.3 LSTM, `tha`/`hin`/`sin` traineddata from apt, pages rendered with `pdftoppm` | Introduction page in Thai is partly readable (`อิสราเอล`, `แรงงานต่างชาติ`) but misses tone marks and splits words. On the two-column passport page, Tesseract and PyMuPDF share some 12-character tokens and do **not** share one contiguous withholding sentence. The table of contents OCR read `การยืดหนังสือเดินทาง` where the text layer has the withholding heading. A full-book OCR pass stalled on several pages for many minutes and was stopped. Legacy Tesseract (`--oem 0`) cannot load: the apt `tha.traineddata` has no legacy components. |

The sara-am repair is a character-class substitution, not a guess at missing legal words. It was not enough, because the second method did not reproduce the same sentences.

## Decision

No Thai, Hindi, or Sinhala section met the bar: correct key spellings **and** the same numbers as Hebrew/English **and** agreement of two independent extracts on the quote. Drafts stay `extraction_unreliable`.

## Free alternatives still open

- A second OCR engine with its own model (EasyOCR or PaddleOCR weights are not installed here; they are free but were not added).
- Official HTML or plain-text editions on gov.il, if PIBA publishes them. The listing page itself was behind a bot check in the earlier pass; only the PDF URLs were fetched.
- Source files from PIBA (InDesign or Word), which would remove the font-encoding problem.
- Native speakers reviewing a future extract. Do not repair the current Hindi or Sinhala text by hand.
