/*
  RoBlast studio content.

  Each section on the home page stays hidden until its list has at least
  one entry, so you can fill these in whenever you're ready.

  ROBLAST_MILESTONES -> "Our Journey" timeline (shown oldest first)
    date:        any label, e.g. 'Mar 2025' or '2024'
    title:       short headline
    description: optional one-liner

  ROBLAST_TEAM -> "The Team" ID cards
    name:          display name
    role:          e.g. 'Founder & Lead Developer'
    robloxUserId:  optional number from the Roblox profile URL
                   (roblox.com/users/<id>/profile); loads their avatar
                   and links the card to their profile
    avatar:        optional image path/URL; overrides the Roblox avatar
*/
const ROBLAST_MILESTONES = [
  { date: '2021', title: 'RoBlast founded' },
  { date: 'July 2022', title: 'Clean Up Bedwars! launches' },
  { date: 'Aug 2024', title: 'Mansion Tycoon launches' },
  { date: 'June 2026', title: 'Kart for Brainrots launches' },
  { date: 'Oct 2026', title: 'Spin a Soccer Player launches' },
];

const ROBLAST_TEAM = [
  { name: 'Dxvil', role: 'Founder & CEO', avatar: 'team/dxvil.webp' },
  { name: 'Ethan', role: 'Co-Founder', avatar: 'team/ethan.webp' },
];
