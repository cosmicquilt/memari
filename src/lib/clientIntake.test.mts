// Clients without typing (clientIntake.ts): a spreadsheet read as coaches
// make them, and the fields a tool posts. Expected values by hand.
//
// Run as part of: npm test

import { clientFrom, clientsFromCsv, countryCodeOf, dateOf, fieldsOf, parseCsv } from "./clientIntake";
import { toCsv, type ClientRow } from "./businessExport";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

// reading a CSV
const rows = parseCsv('﻿Name,Email,Note\r\n"Okafor, Maya",maya@example.com,"Says ""hi""\nand more"\r\n\r\nSam Lee,,\n');
check(rows.length === 2 + 0 + 1, `rows, the blank one dropped (${rows.length})`);
check(rows[0][0] === "Name", "the byte-order mark is not part of the first heading");
check(rows[1][0] === "Okafor, Maya" && rows[1][2] === 'Says "hi"\nand more', "quoted commas, doubled quotes and a line break inside a cell");
check(rows[2][0] === "Sam Lee" && rows[2].length === 3, "LF lines too, and empty cells kept");

// the names columns go by
check(JSON.stringify(fieldsOf(["Full Name", "E-mail", "ZIP code", "Address Line 2", "Favorite colour"])) === JSON.stringify(["name", "email", "postcode", "street2", null]), "headings matched without case, spaces or marks; unknown ones left");

// fields
check(countryCodeOf("us") === "US" && countryCodeOf("United States") === "US" && countryCodeOf("USA") === "US" && countryCodeOf("United Kingdom") === "GB" && countryCodeOf("UK") === "GB", "countries by code or name");
check(countryCodeOf("Narnia") === null && countryCodeOf("") === null, "an unknown country is unknown");
const d1 = dateOf("2027-01-04");
const d2 = dateOf("1/4/2027");
check(d1 instanceof Date && d1.toISOString().startsWith("2027-01-04") && d2 instanceof Date && d2.toISOString().startsWith("2027-01-04"), "ISO dates, and American month/day/year");
check(dateOf("2027-02-30") === "bad" && dateOf("next week") === "bad" && dateOf("") === null, "a date that isn't one is refused; none is none");

const one = clientFrom({ "First Name": "Maya", "Last Name": "Okafor", Email: "MAYA@example.com", Street: "120 Elm Street", City: "Jersey City", State: "NJ", Zip: "07302", Months: "6 months", "Start date": "1/4/2027" });
check(one.ok && one.client.name === "Maya Okafor" && one.client.bookMonths === 6 && one.client.shippingAddress?.countryCode === "US" && one.client.shippingAddress.name === "Maya Okafor", `first and last names joined; "6 months" read; no country is the US (${JSON.stringify(one)})`);
check(one.ok && one.client.startDate?.toISOString().startsWith("2027-01-04") === true, "the start date read");
const noName = clientFrom({ Email: "x@example.com" });
check(!noName.ok, "no name, no client");
const badEmail = clientFrom({ Name: "Sam", Email: "sam at example" });
check(!badEmail.ok && badEmail.error.includes("Sam"), "a bad email is refused, naming who");
const badMonths = clientFrom({ Name: "Sam", Months: "4" });
check(!badMonths.ok && badMonths.error.includes("1, 3, 6 or 12"), "a book runs 1, 3, 6 or 12 months");
const nowhere = clientFrom({ Name: "Sam", Street: "1 Rue", City: "Paris", Postcode: "75001", Country: "Narnia" });
check(!nowhere.ok && nowhere.error.includes("Narnia"), "a country Memari can't post to is refused");
const posted = clientFrom({ name: "Ana", email: "ana@example.com", start_date: "2027-02-01", months: 3, template: "Clarity Quarterly", phone: "'+1 201 555 0100" });
check(posted.ok && posted.client.template === "Clarity Quarterly" && posted.client.shippingAddress === null && posted.client.bookMonths === 3, "what Zapier posts: snake_case names, a number, a template; no address is no address");
check(clientFrom({ name: { first: "x" } }).ok === false, "a field that is an object is not read as text");

// a spreadsheet as a whole
const sheet = clientsFromCsv("Client,Email,Months\nMaya,maya@example.com,3\nSam,bad,3\nAna,,12\n");
check(sheet.clients.length === 2 && sheet.problems.length === 1 && sheet.problems[0].row === 3, `two clients and row 3's problem (${JSON.stringify(sheet.problems)})`);
check(clientsFromCsv("Email\nx@example.com\n").problems[0]?.error.includes("Name") === true, "a sheet with no Name column says so");

// ROUND TRIP: a coach's download from Clients goes straight back in
const exported: ClientRow = {
  name: "Maya Okafor",
  coverName: "Maya",
  email: "maya@example.com",
  template: "Clarity Quarterly",
  startDate: "2027-01-04",
  bookMonths: 3,
  address: { name: "Maya Okafor", street1: "120 Elm Street, Apt 4", street2: "", city: "Jersey City", state: "NJ", postcode: "07302", country: "US", phone: "+1 201 555 0100" },
  note: "Prefers coil, \"no rush\"",
  archived: "",
  linkLastOpened: "",
  booksOrdered: 1,
  lastBook: "2026-10-05 to 2027-01-03",
  group: "January cohort",
  answers: "What matters most each week? Run before work",
};
const back = clientsFromCsv(toCsv([exported]));
const c = back.clients[0];
check(back.problems.length === 0 && !!c, `the export reads back with no problems (${JSON.stringify(back.problems)})`);
check(
  !!c && c.name === "Maya Okafor" && c.coverName === "Maya" && c.email === "maya@example.com" && c.template === "Clarity Quarterly" && c.bookMonths === 3 && c.note === 'Prefers coil, "no rush"',
  `name, cover, email, template, months and note survive (${JSON.stringify(c)})`
);
check(!!c?.shippingAddress && c.shippingAddress.street1 === "120 Elm Street, Apt 4" && c.shippingAddress.phoneNumber === "+1 201 555 0100" && c.shippingAddress.countryCode === "US", "the address survives, the phone's + without the export's apostrophe");

if (failures > 0) {
  console.error(`\n${failures} intake check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All client intake checks passed.");
}
