// WHERE A BOOK CAN BE SENT: "Worldwide" (2026-10-04). ISO 3166-1 alpha-2
// codes, named by the browser (Intl.DisplayNames) so the list reads in the
// person's own language. Left out: places with no post (Antarctica, Bouvet,
// Heard and McDonald, South Georgia, the French Southern Territories, the US
// Minor Outlying Islands, the British Indian Ocean Territory) and the
// countries US sanctions bar both Stripe and Lulu from serving (Cuba, Iran,
// North Korea, Syria). Anything else Lulu cannot post to, its quote says.

export const COUNTRY_CODES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO " +
  "FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR " +
  "MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA " +
  "RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TG TH TJ TK TL TM TN TO TR " +
  "TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

/** The countries, named and sorted for a menu in `locale`. */
export function countryOptions(locale = "en"): Array<{ code: string; name: string }> {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    names = null;
  }
  return COUNTRY_CODES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, locale));
}
