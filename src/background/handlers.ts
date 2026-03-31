// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { registerHandler } from './message-router';
import { registerClipHandlers } from './clip-handler';
import { registerClipPageHandlers } from './clip-page-handler';
import { registerRelatedClipsHandlers } from './related-clips-handler';
import { registerSontoItemHandlers } from './sonto-item-handler';
import { MSG } from '../shared/messages';

export function registerAllHandlers(): void {
  registerClipHandlers(registerHandler);
  registerClipPageHandlers(registerHandler);
  registerRelatedClipsHandlers(registerHandler);
  registerSontoItemHandlers(registerHandler);

  registerHandler(MSG.OPEN_SETTINGS, async () => {
    await chrome.runtime.openOptionsPage();
    return {};
  });
}
