export interface EmoteDefinition {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly text: string;
}

// Command names follow the familiar slash vocabulary; prose belongs to Frostwood.
const entries = `
agree|agrees with a nod.
amaze|looks thoroughly amazed.
angry,mad|clenches their fists in anger.
apologize,sorry|offers a sincere apology.
applaud,applause,bravo|breaks into applause.
attacktarget|calls for an attack on the target.
bark|barks sharply.
bashful|looks away shyly.
beckon|gestures for company.
beg|makes a pleading gesture.
belch,burp|lets out a belch.
bite|snaps their teeth playfully.
bleed|checks a bleeding wound.
blink|blinks in disbelief.
blush|turns red with embarrassment.
boggle|stares in bewilderment.
bonk|gives a playful bonk.
bored|looks for something interesting to do.
bounce|bounces with excitement.
bow|offers a courteous bow.
brb|steps aside for a moment.
bye,farewell,goodbye|waves farewell.
cackle|lets out a mischievous cackle.
calm|makes a calming gesture.
cat,catty,scratch|scratches like a cat.
charge|calls for a charge.
cheer|raises their arms and cheers.
chicken,flap,strut|flaps their arms like a chicken.
chuckle|chuckles quietly.
clap|claps their hands.
cold|shivers in the cold.
comfort|offers a little comfort.
commend|offers warm praise.
confused|looks puzzled.
congrats,congratulate,congratulations|offers congratulations.
cough|coughs into their sleeve.
cower|shrinks back in fear.
crack,knuckles|cracks their knuckles.
cringe|winces awkwardly.
cry,sob,weep|sheds a few tears.
cuddle,spoon|offers a cozy cuddle.
curious|tilts their head with curiosity.
curtsey|gives a graceful curtsey.
dance|starts to dance.
disappointed,disappointment|sighs with disappointment.
doh|realizes their mistake.
doom|foretells approaching doom.
drink,shindig|raises a drink in good company.
drool|wipes a little drool away.
duck|ducks their head.
eat,chew,feast|takes a hearty bite.
eye|casts a watchful glance.
fart|looks innocent after an unfortunate noise.
fidget,impatient|fidgets impatiently.
flirt|offers a flirtatious smile.
flex,strong|flexes their muscles.
flop|flops down dramatically.
followme|gestures for others to follow.
frown,disdain|wears a deep frown.
gasp|gasps in surprise.
gaze|gazes into the distance.
giggle|tries to contain a giggle.
glad,happy,delight|beams with happiness.
gloat|looks a little too pleased with themself.
golfclap|offers a restrained round of applause.
greet,greetings|offers a friendly greeting.
grin,wicked,wickedly|grins mischievously.
groan|groans in dismay.
grovel,peon|bows low in humility.
growl|gives a warning growl.
guffaw|erupts in laughter.
hail|raises a hand in greeting.
healme|calls for healing.
hello,hi|says hello with a smile.
helpme|calls for help.
hug|opens their arms for a hug.
hungry,food|looks ready for a meal.
insult|offers a cutting insult.
introduce|makes an introduction.
jk|admits they were only joking.
kiss,blow|blows a kiss.
kneel|kneels down.
laugh,lol|laughs aloud.
lay,laydown,liedown|lies down to rest.
lick|sticks out their tongue for a lick.
listen|listens carefully.
lost|looks uncertain of the way.
love|makes a heartfelt gesture.
massage|offers a shoulder massage.
moan|moans wearily.
mock|makes a mocking face.
moo|imitates a cow.
moon|makes a rude display.
mourn|bows their head in mourning.
no|shakes their head.
nod,yes|nods in agreement.
nosepick,pick|picks their nose absentmindedly.
oom|calls out that their magic is spent.
openfire|signals to open fire.
panic|looks around in panic.
pat|offers a reassuring pat.
peer|peers closely.
pity|offers a sympathetic look.
plead|pleads for understanding.
point|points emphatically.
poke|gives a gentle poke.
ponder|pauses in thought.
pounce|makes a playful pounce.
praise,lavish|offers generous praise.
pray|bows their head in prayer.
purr|purrs contentedly.
puzzle|tries to make sense of things.
rasp,rude|blows a raspberry.
ready,rdy|signals readiness.
roar|lets out a mighty roar.
rofl|doubles over with laughter.
salute|stands tall and salutes.
scared,fear|trembles with fear.
sexy|strikes a confident pose.
shake|shakes their head in disbelief.
shimmy|gives a playful shimmy.
shiver|shivers from head to toe.
shoo,pest|waves a nuisance away.
shrug|shrugs their shoulders.
shy|smiles shyly.
sigh|lets out a long sigh.
silly|tells a silly joke.
slap|makes a dramatic slapping gesture.
sleep|settles down for a nap.
smell,sniff|sniffs the air.
smile|smiles warmly.
smirk|gives a knowing smirk.
snarl|bares their teeth with a snarl.
snicker|snickers under their breath.
snub|turns away with a huff.
soothe|offers soothing words.
spit|spits on the ground.
stare|stares intently.
surprised|looks taken by surprise.
surrender|raises their hands in surrender.
talk|starts a conversation.
talkex,excited|talks with great excitement.
talkq,question|asks a thoughtful question.
tap|taps their foot.
taunt|issues a daring taunt.
tease|offers some playful teasing.
thank,thanks,ty|offers heartfelt thanks.
thirsty|looks for something to drink.
threat,threaten,doomwarning|makes a threatening gesture.
tickle|reaches out for a playful tickle.
tired|rubs their tired eyes.
train|chugs along like a runaway train.
veto|firmly objects.
victory|celebrates a hard-won victory.
violin|plays an imaginary violin.
wait|signals to wait.
wave|waves a friendly hello.
welcome|offers a warm welcome.
whine|complains at length.
whistle|whistles a bright tune.
work|gets down to work.
yawn|stifles a broad yawn.
yw|gladly accepts the thanks.
`.trim();

export const EMOTES: readonly EmoteDefinition[] = entries.split('\n').map(row => {
  const [commands, text] = row.split('|') as [string, string];
  const [name, ...aliases] = commands.split(',') as [string, ...string[]];
  return { name, aliases, text };
});
const commands = new Map(EMOTES.flatMap(emote => [emote.name, ...emote.aliases].map(name => [name, emote] as const)));
export function findEmote(command: string): EmoteDefinition | undefined {
  return commands.get(command.replace(/^\//, '').toLowerCase());
}
export function emoteText(emote: EmoteDefinition, target?: string): string {
  return target ? `${emote.text.slice(0, -1)} (to ${target}).` : emote.text;
}
export const EMOTE_HELP = `Emotes: ${EMOTES.map(emote => `/${emote.name}`).join(', ')}. Also /sit, /stand and /e your action. Add a character or creature name to address them. Use /roll for a roll from 1 to 100.`;
