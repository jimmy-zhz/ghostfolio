import { inject } from '@angular/core';
import { Params, RedirectFunction, Router } from '@angular/router';

/**
 * Redirects a moved page to its new address. Unlike a plain `redirectTo`
 * string it keeps the query parameters, which open dialogs such as the
 * holding detail dialog.
 */
export function redirectKeepingQueryParams(
  getCommands: (params: Params) => string[]
): RedirectFunction {
  return ({ params, queryParams }) => {
    return inject(Router).createUrlTree(getCommands(params), { queryParams });
  };
}
