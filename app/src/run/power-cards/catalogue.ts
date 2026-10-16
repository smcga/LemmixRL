import source from './catalogue.json';
import { parsePowerCardLibrary } from './schema.ts';

/** The designer exports exactly this format. Presentation is data; effect implementations live in content.ts. */
export const POWER_CARD_LIBRARY = parsePowerCardLibrary(source);
