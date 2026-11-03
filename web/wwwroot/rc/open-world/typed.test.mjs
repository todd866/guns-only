import test from 'node:test';
import assert from 'node:assert/strict';
import {clean, sounds, nameFrom, say, distance, DICTIONARY} from './typed.mjs';

test('case, spaces and punctuation never matter', () => {
  assert.equal(clean('  ReX!! '), 'rex');
  assert.ok(sounds('REX', 'rex'));
  assert.ok(sounds('here boy', 'here'));
});

test('a small spelling slip still matches, a different word does not', () => {
  assert.equal(distance('dinsaur', 'dinosaur'), 1);
  assert.ok(sounds('dinsaur', 'dinosaur'));
  assert.ok(sounds('rexx', 'rex'));
  assert.ok(sounds('wistle', 'whistle'));
  assert.ok(!sounds('cat', 'rex'));
});

test('names: trimmed, capitalised, short; empty keeps the old one', () => {
  assert.equal(nameFrom('  rex the rocket dinosaur ', 'Dino'), 'Rex the rock');
  assert.equal(nameFrom('', 'Dino'), 'Dino');
  assert.equal(nameFrom('<b>', 'Dino'), 'B');
});

test("saying the dinosaur's name in the past calls it, on foot", () => {
  assert.equal(say('rexx', {era: 'past', mount: 'Rex', onFoot: true}).call, 'mount');
  assert.equal(say('here', {era: 'past', mount: 'Rex', onFoot: true}).call, 'mount');
  assert.equal(say('rex', {era: 'past', mount: 'Rex', onFoot: false}).call, null, 'already riding');
  assert.equal(say('rex', {era: 'present', mount: 'Rex', onFoot: true}).call, null, 'it lives long ago');
});

test('anything at all gets a friendly reply, and nothing typed is an error', () => {
  for (const t of ['hello', 'yeehaw', '67', 'asdfgh', 'poop', '🙂'])
    assert.ok(say(t, {era: 'past'}).reply, t);
  assert.equal(say('', {}).reply, null);
});

test('a little Spanish works too, accents or not, and "si" is not mistaken for "hi"', () => {
  assert.equal(say('Hola', {era: 'past'}).reply, '🤠 ¡Hola, amigo!');
  assert.equal(say('holla', {era: 'past'}).reply, '🤠 ¡Hola, amigo!', 'one slip');
  assert.equal(say('gracias').reply, '🤠 ¡De nada!');
  assert.equal(say('adiós').reply, '👋 ¡Adiós, amigo!');
  assert.equal(say('adios').reply, '👋 ¡Adiós, amigo!');
  assert.equal(say('sí').reply, '👍 ¡Sí!');
  assert.equal(say('hi', {era: 'past'}).reply, '🤠 ¡Hola! Howdy!');
  assert.equal(say('hello').reply, '👋 Hello!');
});

test('feelings get kind, era-aware replies', () => {
  assert.equal(say('happy', {era: 'present'}).reply, '😊 Big robot smile!');
  assert.equal(say('happy', {era: 'past'}).reply, '🤠 Happy as a dino!');
  assert.equal(say('sad', {era: 'present'}).reply, '🤗 Beep boop! A hug!');
  assert.equal(say('sad', {era: 'past'}).reply, '🤗 Dino hug for you!');
  assert.equal(say('mad', {era: 'present'}).reply, '🧯 Cool down, beep!');
  assert.equal(say('mad', {era: 'past'}).reply, '🦕 Deep dino breath!');
  assert.equal(say('scared', {era: 'present'}).reply, '🛡️ You are safe here!');
  assert.equal(say('scared', {era: 'past'}).reply, '🦕 Dinosaurs protect!');
  assert.equal(say('tired', {era: 'present'}).reply, '🔋 Time to recharge!');
  assert.equal(say('tired', {era: 'past'}).reply, '💤 Dino nap time!');
  assert.equal(say('bored', {era: 'present'}).reply, '🚀 Let us go explore!');
  assert.equal(say('bored', {era: 'past'}).reply, '🦖 Let us go stomp!');
  assert.equal(say('i love you', {era: 'present'}).reply, '💖 Beep! Love you too!');
  assert.equal(say('love', {era: 'past'}).reply, '❤️ Dino love you too!');
  assert.equal(say('sorry', {era: 'present'}).reply, '✨ All good, pal!');
  assert.equal(say('sorry', {era: 'past'}).reply, '🤠 It is okay, partner!');
  assert.equal(say('thank you', {era: 'present'}).reply, '🤖 You are welcome!');
  assert.equal(say('thanks', {era: 'past'}).reply, '🤠 You bet, partner!');
});

test('social words and reactions get kind, warm replies', () => {
  assert.equal(say('yes', {era: 'present'}).reply, '👍 Yay! Roger that!');
  assert.equal(say('yes', {era: 'past'}).reply, '👍 Yeehaw! Yes sir!');
  assert.equal(say('no', {era: 'present'}).reply, '🛑 ¡No! No problem!');
  assert.equal(say('no', {era: 'past'}).reply, '🤠 ¡No! No problem, pal!');
  assert.equal(say('ok', {era: 'present'}).reply, '👌 A-okay, beep!');
  assert.equal(say('ok', {era: 'past'}).reply, '👌 Okie dokie!');
  assert.equal(say('help', {era: 'present'}).reply, '🚨 Rescue drone ready!');
  assert.equal(say('help', {era: 'past'}).reply, '🤠 Dino help is here!');
  assert.equal(say('wow', {era: 'present'}).reply, '✨ Super cool, right?');
  assert.equal(say('wow', {era: 'past'}).reply, '🌟 Wild and woolly!');
  assert.equal(say('cool', {era: 'present'}).reply, '😎 Ice cold, beep!');
  assert.equal(say('cool', {era: 'past'}).reply, '😎 Cool as a cactus!');
  assert.equal(say('lol', {era: 'present'}).reply, '😆 Giggle circuit on!');
  assert.equal(say('lol', {era: 'past'}).reply, '😂 That tickles, dino!');
  assert.equal(say('haha', {era: 'present'}).reply, '😂 Beep beep haha!');
  assert.equal(say('haha', {era: 'past'}).reply, '😂 Dino laughs! Haha!');
  assert.equal(say('oops', {era: 'present'}).reply, '🔧 We can fix that!');
  assert.equal(say('oops', {era: 'past'}).reply, '🤠 Dust yourself off!');
  assert.equal(say('bye', {era: 'present'}).reply, '👋 See you next time!');
  assert.equal(say('bye', {era: 'past'}).reply, '👋 Happy trails, pal!');
  assert.equal(say('goodnight', {era: 'present'}).reply, '🌙 Sleep tight, beep!');
  assert.equal(say('goodnight', {era: 'past'}).reply, '🌙 Sweet dino dreams!');
});

test('animals and dinosaurs get era-differing replies', () => {
  assert.equal(say('dog', {era: 'present'}).reply, '🐶 Robo-pup says woof!');
  assert.equal(say('dog', {era: 'past'}).reply, '🐶 Prairie pup! Woof!');
  assert.equal(say('cat', {era: 'present'}).reply, '🐱 Laser cat says purr!');
  assert.equal(say('cat', {era: 'past'}).reply, '🐱 Barn cat says meow!');
  assert.equal(say('horse', {era: 'present'}).reply, '🐴 Turbo pony goes zoom!');
  assert.equal(say('horse', {era: 'past'}).reply, '🐴 Giddyup, horsey!');
  assert.equal(say('cow', {era: 'present'}).reply, '🐮 Space cow goes moo!');
  assert.equal(say('cow', {era: 'past'}).reply, '🐮 Mooo on the range!');
  assert.equal(say('bird', {era: 'present'}).reply, '🐦 Drone bird flies high!');
  assert.equal(say('bird', {era: 'past'}).reply, '🐦 Chirp in the canyon!');
  assert.equal(say('t rex', {era: 'present'}).reply, '🦖 Tiny arms, big roar!');
  assert.equal(say('t rex', {era: 'past'}).reply, '🦖 ROAR! King of dinos!');
  assert.equal(say('raptor', {era: 'present'}).reply, '⚡ Super fast raptor!');
  assert.equal(say('raptor', {era: 'past'}).reply, '🦕 Speedy raptor pack!');
  assert.equal(say('triceratops', {era: 'present'}).reply, '🦏 Three laser horns!');
  assert.equal(say('triceratops', {era: 'past'}).reply, '🦕 Three mighty horns!');
  assert.equal(say('stegosaurus', {era: 'present'}).reply, '🦕 Solar tail spikes!');
  assert.equal(say('stegosaurus', {era: 'past'}).reply, '🦕 Big spiky plates!');
  assert.equal(say('brontosaurus', {era: 'present'}).reply, '🦕 Giant tall neck!');
  assert.equal(say('argentinosaurus', {era: 'past'}).reply, '🦕 Long neck in trees!');
  assert.equal(say('pterodactyl', {era: 'present'}).reply, '🦅 Gliding in the sky!');
  assert.equal(say('quetzalcoatlus', {era: 'past'}).reply, '🦅 Giant wings soar!');
});

test('vehicle and game words reply with action', () => {
  assert.equal(say('car', {era: 'present'}).reply, '🚗 Vroom vroom! Zoom!');
  assert.equal(say('car', {era: 'past'}).reply, '🦕 Dino ride is better!');
  assert.equal(say('fast', {era: 'present'}).reply, '⚡ Maximum speed!');
  assert.equal(say('fast', {era: 'past'}).reply, '💨 Fast as the wind!');
  assert.equal(say('jump', {era: 'present'}).reply, '🦘 Boosters engaged!');
  assert.equal(say('jump', {era: 'past'}).reply, '🦘 Big bouncy leap!');
  assert.equal(say('race', {era: 'present'}).reply, '🏁 3, 2, 1, GO!');
  assert.equal(say('race', {era: 'past'}).reply, '🏁 Dino derby time!');
  assert.equal(say('win', {era: 'present'}).reply, '🏆 You are number 1!');
  assert.equal(say('win', {era: 'past'}).reply, '🏆 Champion cowboy!');
  assert.equal(say('rocket', {era: 'present'}).reply, '🚀 Blast off to space!');
  assert.equal(say('rocket', {era: 'past'}).reply, '🚀 A sky firecracker!');
  assert.equal(say('robot', {era: 'present'}).reply, '🤖 Beep boop, that is me!');
  assert.equal(say('robot', {era: 'past'}).reply, '🤖 A metal cowboy!');
  assert.equal(say('alien', {era: 'present'}).reply, '👽 Friendly space buddy!');
  assert.equal(say('alien', {era: 'past'}).reply, '👽 Star friend visits!');
  assert.equal(say('ufo', {era: 'present'}).reply, '🛸 Flying saucer glow!');
  assert.equal(say('ufo', {era: 'past'}).reply, '🛸 Shiny sky wagon!');
  assert.equal(say('beep', {era: 'present'}).reply, '🔊 Beep beep boop!');
  assert.equal(say('beep', {era: 'past'}).reply, '🔊 Beep goes the gizmo!');
});

test('colours reply with matching emoji', () => {
  assert.equal(say('red', {era: 'present'}).reply, '🔴 Shiny red rover!');
  assert.equal(say('red', {era: 'past'}).reply, '🔴 Red canyon rock!');
  assert.equal(say('blue', {era: 'present'}).reply, '🔵 Bright blue neon!');
  assert.equal(say('blue', {era: 'past'}).reply, '🔵 Clear blue sky!');
  assert.equal(say('green', {era: 'present'}).reply, '🟢 Glowing green light!');
  assert.equal(say('green', {era: 'past'}).reply, '🟢 Green valley grass!');
  assert.equal(say('yellow', {era: 'present'}).reply, '🟡 Yellow radar flash!');
  assert.equal(say('yellow', {era: 'past'}).reply, '🟡 Warm yellow sun!');
  assert.equal(say('pink', {era: 'present'}).reply, '🌸 Pretty pink laser!');
  assert.equal(say('pink', {era: 'past'}).reply, '🌸 Sweet pink flower!');
  assert.equal(say('purple', {era: 'present'}).reply, '🟣 Purple space dust!');
  assert.equal(say('purple', {era: 'past'}).reply, '🟣 Purple sunset sky!');
  assert.equal(say('orange', {era: 'present'}).reply, '🟠 Orange warning light!');
  assert.equal(say('orange', {era: 'past'}).reply, '🟠 Orange camp fire!');
  assert.equal(say('black', {era: 'present'}).reply, '⚫ Deep space black!');
  assert.equal(say('black', {era: 'past'}).reply, '⚫ Dark starry night!');
  assert.equal(say('white', {era: 'present'}).reply, '⚪ White lunar glow!');
  assert.equal(say('white', {era: 'past'}).reply, '⚪ Fluffy white cloud!');
});

test('numbers 1-10 typed as digits or words cheer and count', () => {
  assert.equal(say('1').reply, '1️⃣ Number one! Zoom!');
  assert.equal(say('one', {era: 'past'}).reply, '1️⃣ One little dino!');
  assert.equal(say('2').reply, '2️⃣ Two robot eyes!');
  assert.equal(say('two', {era: 'past'}).reply, '2️⃣ Two dino friends!');
  assert.equal(say('3').reply, '3️⃣ Three, two, one!');
  assert.equal(say('three', {era: 'past'}).reply, '3️⃣ Three dino horns!');
  assert.equal(say('4').reply, '4️⃣ Four sturdy wheels!');
  assert.equal(say('four', {era: 'past'}).reply, '4️⃣ Four stompy feet!');
  assert.equal(say('5').reply, '5️⃣ High five, buddy!');
  assert.equal(say('five', {era: 'past'}).reply, '5️⃣ High five, partner!');
  assert.equal(say('6').reply, '6️⃣ Six whirring gears!');
  assert.equal(say('six', {era: 'past'}).reply, '6️⃣ Six dino eggs!');
  assert.equal(say('7').reply, '7️⃣ Lucky number seven!');
  assert.equal(say('seven', {era: 'past'}).reply, '7️⃣ Seven canyon birds!');
  assert.equal(say('8').reply, '8️⃣ Eight drone blades!');
  assert.equal(say('eight', {era: 'past'}).reply, '8️⃣ Eight canyon paths!');
  assert.equal(say('9').reply, '9️⃣ Cloud nine, beep!');
  assert.equal(say('nine', {era: 'past'}).reply, '9️⃣ Almost ten dinos!');
  assert.equal(say('10').reply, '🔟 Top ten score!');
  assert.equal(say('ten', {era: 'past'}).reply, '🔟 Ten out of ten!');
  assert.equal(say('six seven').reply, '6️⃣7️⃣ SIX SEVEN!');
  assert.equal(say('67').reply, '6️⃣7️⃣ SIX SEVEN!');
});

test('simple Spanish pairs Spanish with English', () => {
  assert.equal(say('amigo').reply, '🤖 ¡Amigo! Friend!');
  assert.equal(say('amigos', {era: 'past'}).reply, '🤠 ¡Amigo! Friend!');
  assert.equal(say('perro').reply, '🐶 ¡Perro! Dog!');
  assert.equal(say('gato').reply, '🐱 ¡Gato! Cat!');
  assert.equal(say('caballo').reply, '🐴 ¡Caballo! Horse!');
  assert.equal(say('vaca').reply, '🐮 ¡Vaca! Cow!');
  assert.equal(say('agua').reply, '💧 ¡Agua! Water!');
  assert.equal(say('sol').reply, '☀️ ¡Sol! Sun!');
  assert.equal(say('luna').reply, '🌙 ¡Luna! Moon!');
  assert.equal(say('rojo').reply, '🔴 ¡Rojo! Red!');
  assert.equal(say('azul').reply, '🔵 ¡Azul! Blue!');
  assert.equal(say('verde').reply, '🟢 ¡Verde! Green!');
  assert.equal(say('uno').reply, '1️⃣ ¡Uno! One!');
  assert.equal(say('dos').reply, '2️⃣ ¡Dos! Two!');
  assert.equal(say('tres').reply, '3️⃣ ¡Tres! Three!');
  assert.equal(say('cuatro').reply, '4️⃣ ¡Cuatro! Four!');
  assert.equal(say('cinco').reply, '5️⃣ ¡Cinco! Five!');
  assert.equal(say('seis').reply, '6️⃣ ¡Seis! Six!');
  assert.equal(say('siete').reply, '7️⃣ ¡Siete! Seven!');
  assert.equal(say('ocho').reply, '8️⃣ ¡Ocho! Eight!');
  assert.equal(say('nueve').reply, '9️⃣ ¡Nueve! Nine!');
  assert.equal(say('diez').reply, '🔟 ¡Diez! Ten!');
  assert.equal(say('buenos días', {era: 'present'}).reply, '☀️ ¡Buenos días! Good day!');
  assert.equal(say('buenos dias', {era: 'past'}).reply, '🤠 ¡Buenos días! Good day!');
  assert.equal(say('buenas noches').reply, '🌙 ¡Buenas noches! Night!');
  assert.equal(say('te quiero').reply, '❤️ ¡Te quiero! Love you!');
});

test('questions get short friendly answers', () => {
  assert.equal(say('who are you', {era: 'present'}).reply, '🤖 I am your robot buddy!');
  assert.equal(say('who are you', {era: 'past'}).reply, '🤠 I am your toy cowboy!');
  assert.equal(say('what is your name', {era: 'present'}).reply, '🤖 My name is Beep!');
  assert.equal(say('what is your name', {era: 'past'}).reply, '🤠 I am the Lone Rider!');
  assert.equal(say('where am i', {era: 'present'}).reply, '🗺️ In the valley base!');
  assert.equal(say('where am i', {era: 'past'}).reply, '🗺️ In the great canyon!');
});

test('collisions between short and longer words are guarded', () => {
  assert.equal(say('cat').reply, '🐱 Laser cat says purr!');
  assert.equal(say('car').reply, '🚗 Vroom vroom! Zoom!');
  assert.equal(say('cow').reply, '🐮 Space cow goes moo!');
  assert.notEqual(say('cat').reply, say('car').reply);
  assert.notEqual(say('cow').reply, say('car').reply);
  assert.equal(say('no').reply, '🛑 ¡No! No problem!');
  assert.equal(say('so').reply, '💬 "so"', 'no does not steal so');
  assert.equal(say('horse').reply, '🐴 Turbo pony goes zoom!');
  assert.equal(say('house').reply, '💬 "house"', 'horse does not steal house');
  assert.equal(say('raptor').reply, '⚡ Super fast raptor!');
  assert.equal(say('robot').reply, '🤖 Beep boop, that is me!');
  assert.notEqual(say('raptor').reply, say('robot').reply);
  assert.equal(say('mad').reply, '🧯 Cool down, beep!');
  assert.equal(say('sad').reply, '🤗 Beep boop! A hug!');
  assert.notEqual(say('mad').reply, say('sad').reply);
  assert.equal(say('uno').reply, '1️⃣ ¡Uno! One!');
  assert.equal(say('ufo').reply, '🛸 Flying saucer glow!');
  assert.equal(say('dos').reply, '2️⃣ ¡Dos! Two!');
  assert.equal(say('dog').reply, '🐶 Robo-pup says woof!');
  assert.equal(say('tres').reply, '3️⃣ ¡Tres! Three!');
  assert.equal(say('trex').reply, '🦖 Tiny arms, big roar!');
});

test('multi-word input matches phrases first and handles plurals in sentences', () => {
  assert.equal(say('i like dogs').reply, '🐶 Robo-pup says woof!');
  assert.equal(say('we love you', {era: 'present'}).reply, '💖 Beep! Love you too!');
  assert.equal(say('look at that car').reply, '🚗 Vroom vroom! Zoom!');
  assert.equal(say('go really fast').reply, '⚡ Maximum speed!');
  assert.equal(say('buenas noches amigo').reply, '🌙 ¡Buenas noches! Night!');
  assert.equal(say('tell me who are you', {era: 'present'}).reply, '🤖 I am your robot buddy!');
  assert.equal(say('where am i today', {era: 'past'}).reply, '🗺️ In the great canyon!');
  // plurals
  assert.equal(say('cars').reply, '🚗 Vroom vroom! Zoom!');
  assert.equal(say('cats').reply, '🐱 Laser cat says purr!');
  assert.equal(say('horses').reply, '🐴 Turbo pony goes zoom!');
  assert.equal(say('cows').reply, '🐮 Space cow goes moo!');
  assert.equal(say('birds').reply, '🐦 Drone bird flies high!');
  assert.equal(say('raptors').reply, '⚡ Super fast raptor!');
  assert.equal(say('robots').reply, '🤖 Beep boop, that is me!');
  assert.equal(say('rockets').reply, '🚀 Blast off to space!');
  assert.equal(say('aliens').reply, '👽 Friendly space buddy!');
  assert.equal(say('ufos').reply, '🛸 Flying saucer glow!');
  assert.equal(say('perros').reply, '🐶 ¡Perro! Dog!');
  assert.equal(say('gatos').reply, '🐱 ¡Gato! Cat!');
  assert.equal(say('caballos').reply, '🐴 ¡Caballo! Horse!');
  assert.equal(say('vacas').reply, '🐮 ¡Vaca! Cow!');
});

test('all replies are 28 characters or fewer and start with an emoji', () => {
  for (const entry of DICTIONARY) {
    for (const era of ['present', 'past']) {
      const rep = era === 'past' ? entry.past : entry.present;
      assert.ok(rep, 'reply must exist');
      assert.ok(
        rep.length <= 28,
        `reply "${rep}" has length ${rep.length} > 28`
      );
      // Starts with emoji or digit keycap emoji
      assert.ok(
        /^(?:\p{Extended_Pictographic}|\d️⃣)/u.test(rep),
        `reply "${rep}" must start with an emoji`
      );
    }
  }
});

test('no reply or entry contains the forbidden submission word', () => {
  const forbidden = ['e', 'n', 't', 'e', 'r'].join('');
  for (const entry of DICTIONARY) {
    for (const rep of [entry.present, entry.past]) {
      assert.ok(
        !rep.toLowerCase().includes(forbidden),
        `reply "${rep}" must not contain forbidden word`
      );
    }
  }
});
