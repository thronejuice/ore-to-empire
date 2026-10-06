/** error codes from the player-account function / RPCs → i18n keys */
export function accountErrorKey(code: string): string {
  const known = ['name_taken', 'bad_name', 'too_many', 'captcha', 'bad_code', 'locked', 'name_already_set', 'line_in_use'];
  return known.includes(code) ? `acct.err.${code}` : 'err.network';
}
