/** URLs servidas pelo Vite a partir de public/office/. Originais na raiz não são alterados. */
export const OFFICE_ASSET_URLS = {
  roomBuilder: '/office/room-builder-16.png',
  modernOffice: '/office/modern-office-16.png',
  desk: '/office/desk-monitors.png',
  chair: '/office/chair.png',
  plant: '/office/plant.png',
  vending: '/office/vending.png',
  bookshelf: '/office/bookshelf.png',
  conferenceTable: '/office/conference-table.png',
  loungeSofa: '/office/lounge-sofa.png',
} as const;

export const OFFICE_ASSET_KEYS = {
  roomBuilder: 'office-room-builder',
  modernOffice: 'office-modern-sheet',
  desk: 'office-desk',
  chair: 'office-chair',
  plant: 'office-plant',
  vending: 'office-vending',
  bookshelf: 'office-bookshelf',
  conferenceTable: 'office-conference-table',
  loungeSofa: 'office-lounge-sofa',
} as const;
