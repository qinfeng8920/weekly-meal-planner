import type {Profile} from './profile';
import {generalDriApplicable} from './nutrient-reference';

export function canUseLowSodiumSalt(profile:Profile) {
  return Boolean(profile.lowSodiumSalt&&profile.screened&&!profile.fluidLimit&&generalDriApplicable(profile));
}
