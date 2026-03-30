// Copyright (c) Artem Iagovdik. All rights reserved.
// Licensed under the MIT License.

import { registerHandler } from './message-router';
import { registerClipHandlers } from './clip-handler';
import { registerReadLaterHandlers } from './read-later-handler';
import { registerRelatedClipsHandlers } from './related-clips-handler';
import { MSG } from '../shared/messages';

export function registerAllHandlers(): void {
  registerClipHandlers(registerHandler);
  registerReadLaterHandlers(registerHandler);
  registerRelatedClipsHandlers(registerHandler);

  registerHandler(MSG.OPEN_SETTINGS, async () => {
    await chrome.runtime.openOptionsPage();
    return {};
  });
}
