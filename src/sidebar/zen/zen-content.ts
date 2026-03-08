export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ZEN_INITIAL_BATCH = 1;
export const ZEN_DRIP_BATCH = 1;
export const ZEN_DRIP_MS = 15000;
export const ZEN_IDLE_MS = 5 * 60 * 1000;
export const ZEN_MAX_CATCHUP = 6;
export const ZEN_MAX_BUBBLES = 20;

export const SVG_BULB = [
  '<svg class="zen-bulb" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">',
  '<circle cx="8" cy="6" r="4"/>',
  '<path d="M6.5 10v1.5a1.5 1.5 0 0 0 3 0V10" stroke-linecap="round"/>',
  '<path d="M8 14v.5" stroke-linecap="round"/>',
  '</svg>',
].join('');

export const SVG_CHALLENGE = [
  '<svg class="zen-bulb zen-bulb--challenge" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">',
  '<line x1="5" y1="3" x2="5" y2="13"/>',
  '<path d="M5 3 L11 5.5 L5 8"/>',
  '</svg>',
].join('');

export const SVG_AFFIRM = [
  '<svg class="zen-bulb zen-bulb--affirm" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M8 14 V9"/>',
  '<path d="M8 12 C8 12 5 11 4.5 8 C7 7.5 8 10 8 12"/>',
  '<path d="M8 9 C8 9 11 8 11.5 5 C9 4.5 8 7 8 9"/>',
  '</svg>',
].join('');

export const SVG_HN = [
  '<svg class="zen-bulb zen-bulb--hn" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">',
  '<rect width="16" height="16" fill="#ff6600" rx="1.5"/>',
  '<text x="8" y="12" text-anchor="middle" fill="white" font-family="Verdana,Geneva,sans-serif" font-size="10.5" font-weight="bold">Y</text>',
  '</svg>',
].join('');

export const SVG_REDDIT = [
  '<svg class="zen-bulb zen-bulb--reddit" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">',
  '<rect width="16" height="16" fill="#ff4500" rx="1.5"/>',
  '<circle cx="8" cy="8.5" r="4" fill="white"/>',
  '<ellipse cx="6.5" cy="7.8" rx="0.7" ry="0.8" fill="#ff4500"/>',
  '<ellipse cx="9.5" cy="7.8" rx="0.7" ry="0.8" fill="#ff4500"/>',
  '<path d="M6 9.8 C6.5 10.5 7.2 10.8 8 10.8 C8.8 10.8 9.5 10.5 10 9.8" fill="none" stroke="#ff4500" stroke-width="0.6" stroke-linecap="round"/>',
  '<circle cx="12" cy="5.5" r="1" fill="white"/>',
  '<path d="M10.5 4 L12 5.5" stroke="white" stroke-width="0.6"/>',
  '</svg>',
].join('');

export const SVG_QUOTE = [
  '<svg class="zen-bulb zen-bulb--quote" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M3.5 10 C3.5 10 2 8 3 6 C3.5 6 5 6 5 7.5 C5 9 3.5 9.5 3.5 10"/>',
  '<path d="M9 10 C9 10 7.5 8 8.5 6 C9 6 10.5 6 10.5 7.5 C10.5 9 9 9.5 9 10"/>',
  '</svg>',
].join('');


export const SVG_SMITHSONIAN = [
  '<svg class="zen-bulb zen-bulb--smithsonian" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">',
  '<circle cx="8" cy="8" r="2.5"/>',
  '<line x1="8" y1="2" x2="8" y2="4"/><line x1="8" y1="12" x2="8" y2="14"/>',
  '<line x1="2" y1="8" x2="4" y2="8"/><line x1="12" y1="8" x2="14" y2="8"/>',
  '<line x1="3.8" y1="3.8" x2="5.2" y2="5.2"/><line x1="10.8" y1="10.8" x2="12.2" y2="12.2"/>',
  '<line x1="12.2" y1="3.8" x2="10.8" y2="5.2"/><line x1="5.2" y1="10.8" x2="3.8" y2="12.2"/>',
  '</svg>',
].join('');

export const SVG_ATLAS = [
  '<svg class="zen-bulb zen-bulb--atlas" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">',
  '<circle cx="8" cy="8" r="5.5"/>',
  '<line x1="8" y1="2.5" x2="8" y2="13.5"/>',
  '<path d="M2.5 8 Q5 6 8 8 Q11 10 13.5 8"/>',
  '<path d="M2.5 8 Q5 10 8 8 Q11 6 13.5 8" opacity="0.4"/>',
  '</svg>',
].join('');

export const SVG_PHILOSOPHY = [
  '<svg class="zen-bulb zen-bulb--philosophy" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">',
  '<path d="M5 3 C5 3 3 5 3 8 C3 11 5 13 8 13 C11 13 13 11 13 8 C13 5 11 3 8 3"/>',
  '<path d="M8 3 L8 13"/>',
  '</svg>',
].join('');

export const SVG_HAIKU = [
  '<svg class="zen-bulb zen-bulb--haiku" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">',
  '<path d="M8 2 C6 4 5 7 7 9 C9 11 8 13 6 14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  '<path d="M11 4 C10 6 10 8 11 10" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>',
  '<circle cx="6" cy="14" r="0.8" fill="currentColor" opacity="0.5"/>',
  '</svg>',
].join('');

export const SVG_OBLIQUE = [
  '<svg class="zen-bulb zen-bulb--oblique" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">',
  '<rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="#1a1a2e" stroke="#8888bb" stroke-width="1"/>',
  '<text x="8" y="11" text-anchor="middle" fill="#aaaadd" font-family="Georgia,serif" font-size="9" font-style="italic">✦</text>',
  '</svg>',
].join('');

export const OBLIQUE_STRATEGIES: string[] = [
  'Abandon normal instruments',
  'Accept advice',
  'A line has two sides',
  'Allow an easement (an easement is the abandonment of a stricture)',
  'Are there sections? Consider transitions',
  'Ask people to work against their better judgement',
  'Ask your body',
  'Balance the consistency principle with the inconsistency principle',
  'Be extravagant',
  'Be less critical more often',
  'Breathe more deeply',
  'Change instrument roles',
  'Change nothing and continue with immaculate consistency',
  'Cluster analysis',
  'Consider different fading systems',
  'Consult other sources — promising, unpromising',
  'Courage!',
  'Cut a vital connection',
  'Decorate, decorate',
  'Define an area as "safe" and use it as an anchor',
  'Destroy nothing — or destroy the most important thing',
  'Discard an axiom',
  'Disconnect from desire',
  'Discover the recipes you are using and abandon them',
  'Do nothing for as long as possible',
  'Do not be afraid of things because they are easy to do',
  'Do not be frightened of clichés',
  'Do not be frightened to display your talents',
  'Do not break the silence',
  'Do not stress one thing more than another',
  'Do something boring',
  'Do the last thing first',
  'Emphasize differences',
  'Emphasize repetitions',
  'Emphasize the flaws',
  'Faced with a choice, do both',
  'Ghost echoes',
  'Give the game away',
  'Give way to your worst impulse',
  'Go slowly all the way round the outside',
  'Honor thy error as a hidden intention',
  'How would you have done it?',
  'Infinitesimal gradations',
  'Into the impossible',
  'Is it finished?',
  'Is there something missing?',
  'It is simply a matter of work',
  'Just carry on',
  'Look at the order in which you do things',
  'Look closely at the most embarrassing details and amplify them',
  'Lost in useless territory',
  'Make a blank valuable by putting it in an exquisite frame',
  'Make a sudden, destructive unpredictable action; incorporate',
  'Mechanicalize something idiosyncratic',
  'Move towards the unimportant',
  'Mute and continue',
  'Once the search is in progress, something will be found',
  'Only one element of each kind',
  'Pay attention to the appearance of the piece',
  'Overtly resist change',
  'Read an unrelated book',
  'Remove a restriction',
  'Remove ambiguities and convert to specifics',
  'Remove specifics and convert to ambiguities',
  'Repetition is a form of change',
  'Revaluation (a warm feeling)',
  'Shut the door and listen from outside',
  'Simple subtraction',
  'Slow preparation, fast execution',
  'State the problem in words as clearly as possible',
  'Take a break',
  'Take away the elements in order of apparent non-importance',
  'The inconsistency principle',
  'The most important thing is the thing most easily forgotten',
  'The tape is now the music',
  'Tidy up',
  'Trust in the you of now',
  'Turn it upside down',
  'Twist the spine',
  'Use an old idea',
  'Use an unacceptable color',
  'Use fewer notes',
  'Use filters',
  'Use "unqualified" people',
  'Water',
  'What is the simplest thing you can do that will be a stretch?',
  'What mistakes did you make last time?',
  'What would your closest friend do?',
  'What would you do if you were not afraid?',
  'Work at a different speed',
  'You are an engineer',
  'You can only make one dot at a time',
  'You do not have to be ashamed of using your own ideas',
];

export const AI_PATTERNS = [
  /\b(artificial intelligence|machine learning|deep learning|neural network|large language model|llm|gpt-?\d|chatgpt|copilot|chatbot|generative ai|diffusion model|prompt engineering|fine.?tun(ing)?)\b/i,
];

export const BLOCKED_CATEGORY_PATTERNS = [
  /\b(ai|artificial intelligence|machine learning|deep learning|llm|large language model|chatbot|generative|prompt engineering|ai.driven|ai.powered|ai.based|neural network)\b/i,
  /\b(adult|porn|pornograph|explicit|erotic|escort|sex|xxx|onlyfans)\b/i,
  /\b(cannabis|hashish|weed|drug|marijuana|cocaine|narcotic|psychedelic|substance abuse)\b/i,
  /\b(food delivery|ride.?hail|grocery|uber|doordash|restaurant|takeaway|takeout|local service|banking app|subscription service)\b/i,
  /\b(social media|instagram|tiktok|facebook|twitter|youtube|streaming|content creation|video platform|twitch)\b/i,
];
