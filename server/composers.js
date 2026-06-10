// server/composers.js

const COMPOSERS = [
  'Bach', 'Mozart', 'Beethoven', 'Chopin', 'Debussy',
  'Vivaldi', 'Brahms', 'Schubert', 'Tchaikovsky', 'Handel',
  'Haydn', 'Liszt', 'Dvorak', 'Mahler', 'Ravel',
  'Stravinsky', 'Prokofiev', 'Rachmaninoff', 'Elgar', 'Grieg',
  'Mendelssohn', 'Puccini', 'Verdi', 'Wagner', 'Sibelius',
  'Shostakovich', 'Bartok', 'Satie', 'Faure', 'Holst',
]

export function pickComposerName() {
  const idx = Math.floor(Math.random() * COMPOSERS.length)
  return COMPOSERS[idx]
}

export { COMPOSERS }
