/**
 * The roles a person can *request* at sign-up.
 *
 * Note this list is not offered at sign-in. Login derives the session role
 * from the account - an account holding admin always signs in as admin -
 * so there is nothing to choose there. Moving to the workspace is the
 * navbar switch, which only accounts holding both roles ever see.
 */
export const ROLE_OPTIONS = [
  { value: 'user', label: 'Platform user', hint: 'create, run and evaluate agent tasks' },
  { value: 'admin', label: 'Platform admin', hint: 'platform dashboard and approvals' },
]
