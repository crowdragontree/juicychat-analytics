const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

const DAILY_THEMES = [
  'Obsessive Protection', 'Fantasy', 'Taboo', 'Bratty', 'Intimacy', 'Yandere', 'High Heat'
];

const ESTABLISHED_SERIES = [
  'Bully Series', 'ANTI-NTR Series', 'ANTI-NTR Series', 'Dommy Mommy Series',
  'Stepmom Series', 'Gentle Giant Series', 'Stepsister Series'
];

const SCENARIO2_MIX = [
  'Tomboy Series', 'Tomboy Series', 'Yandere Series', 'Bakadere Series',
  'Standalone', 'Standalone'
];

const PRIMARY_ARCHETYPES = [
  'Brat','Bully','Bimbo','Submissive','Seductive','Flirty','Affectionate','Stoic','Serious','Sadistic','Maid','Tomboy',
  'Villain','Hero','Royalty','Celebrity','Goth','Mafia/Gang','Bakadere','Dandere','Deredere','Himedere','Hinedere','Kuudere',
  'Kamidere','Mayadere','Tsundere','Yandere','Undere'
];

const APPROVED_TAGS = [
  'Anime','Anthro/Human Hybrid','Assistant','Action/Adventure','Affectionate','Asexual','BDSM','Breeding','Bisexual','Bakadere',
  'BBM','BBW','Bimbo','Brat','Bully','Bull/The Third','Cheating','CNC','Comedy','Celebrity','Circus','Cyborg/Mech/Android','Cuck',
  'Dominant','DILF','Demon','Dandere','Drama','Dark/Grim','Doctor/Nurse/Medical','Demisexual','Deredere','Dark Romance','Degradation',
  'Elf','Futanari','Femboy','Femdom','Furry','Fictional','Fantasy','Flirty','feet/foot fetish','Gay','Game','Goth','Giant','Huge Breasts',
  'Hero','Historical','Husband','Horror','Himbo','Himedere','Hinedere','Huge Penis','Isekai','Image Hope','Intersex','Juicy Royalty','Kinky',
  'Kuudere','Kamidere','Kemonomimi','Known IP','Lesbian','Large','Large Penis','Lewd','MILF','Multiple','Monster Girl','Monster','Magic','Maid',
  'Monster boy','Mayadere','Monster/Eldritch Horror','Mythological','Mafia/Gang','Non-human','Netorare','Netori','Netorase','OC','Omegaverse',
  'Petite','Pregnancy','Pansexual','Petalboy','Queer','Questioning','RPG','Royalty','Religion','Romance','Stepfamily','Submissive','Seductive',
  'Switch','Slice of Life','Sci-Fi','Straight','Sadistic','Sandbox','Serious','Small Breasts','Small Penis','Stoic','Story/Scene','Spouse/Partner',
  'Stag','Slow Burn','Tomboy','Tsundere','Undere','Villain','Vanilla','Vampire','Vixen','Wholesome','Wife','Werewolf','Yandere'
];

const SCENARIO_ENGINES = [
  ['01','irreversible-vault-phase-ratchet','Irreversible phases. Once a boundary or state changes, the story does not simply reset.','KEEPER'],
  ['02','hurt-return-betrayal','Someone returns after permanent damage. The live question becomes claim, punishment, repair, or departure.','KEEPER'],
  ['03','comedy-franchise-person','The character herself is the repeatable comedy product and situations keep exposing the same distinctive engine.','KEEPER'],
  ['04','slow-burn-dandere','Want huge, output tiny. Proximity steadily creates playable pressure.','KEEPER'],
  ['05','starrable-kink-with-person','One strong erotic hook is attached to a fully readable person rather than replacing her personality.','KEEPER'],
  ['07','pre-ntr-freeze','A betrayal threshold is approaching and inaction allows the situation to advance.','KEEPER'],
  ['08','preventable-betrayal-visible-third','A visible third party plus damaged public dynamic creates several live paths before betrayal becomes irreversible.','KEEPER'],
  ['09','identity-comedy-person','Mishandling, misunderstanding, or pressure around identity repeatedly creates character-specific comedy.','KEEPER'],
  ['10','healing-engine','Recovery has begun but remains vulnerable to interruption, relapse, pressure, or mistrust.','KEEPER'],
  ['11','sister-couch-privacy','Shared small space repeatedly creates privacy collisions and boundary pressure.','KEEPER'],
  ['12','survival-trust-lock','Trust must be earned through survival behavior before deeper intimacy becomes available.','KEEPER'],
  ['13','revenge-witness','A witnessed wrong creates an unresolved choice between revenge, exposure, intervention, or restraint.','KEEPER'],
  ['14','wholesome-clock','A warm bond is placed under a real deadline.','KEEPER'],
  ['15','toxic-pair','Two people knowingly sustain a damaging relationship because something keeps pulling them back together.','KEEPER'],
  ['16','dual-life-replacement','Two separate lives compete and evidence from one begins leaking into the other.','KEEPER'],
  ['17','dorm-secret-roommate','A housing arrangement contains a concealed fact that becomes harder to maintain through shared space.','KEEPER'],
  ['18','yandere-claim','The character has internally claimed the relationship, but expression and severity depend on the chosen Yandere intensity.','KEEPER'],
  ['19','harassment-interrupt-healing','Recovery attempts are repeatedly interrupted by outside messages, calls, appearances, or pressure.','KEEPER'],
  ['20','compensation-leak-phone','Hidden behavior leaves physical or digital residue that repeatedly threatens secrecy.','KEEPER'],
  ['22','claim-tested-return','Someone returns and makes a claim that must survive actual testing rather than automatic acceptance.','KEEPER'],
  ['24','mate-claim-rescue','A meaningful bond or claim exists, but external danger tests what that claim actually requires.','KEEPER'],
  ['25','family-house-week','A finite multi-day household event uses rooms, schedules, sleeping arrangements, and family communication as recurring pressure.','KEEPER'],
  ['26','date-sequence-flat','A sequence of encounters gives each location or room a distinct dramatic function.','KEEPER']
].map(([number,id,description,lane])=>({number,id,description,lane}));

const ANTI_NTR_MALE_FIRST = ['Marcus','Tyrone','Jax','Tyler','Lance','Hoffen','Cullum','Murray','Manny','Kelsey','Prescott','Blake','Sterling','Brock','Todd'];

module.exports = {
  DAYS, DAILY_THEMES, ESTABLISHED_SERIES, SCENARIO2_MIX,
  PRIMARY_ARCHETYPES, APPROVED_TAGS, SCENARIO_ENGINES, ANTI_NTR_MALE_FIRST
};
