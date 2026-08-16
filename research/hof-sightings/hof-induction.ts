// Copyright (c) 2026 Syd Polk
// SPDX-License-Identifier: BSD-3-Clause
//
// HOF induction YEAR per player, keyed by Retrosheet player_id. Not in the
// Retrosheet data we load (biofile carries only a binary HOF flag), so fetched
// once from each player's Retrosheet bio page ("Selected to the Hall of Fame in
// YYYY") and cached here. Covers everyone the study lists — HOF players seen on
// the field AND HOF people seen as manager of record. Used to sort both tables in
// induction order (as the Cooperstown Plaque Gallery is arranged). Regenerate by
// re-fetching if the attended list gains new HOF players or managers.
export const HOF_INDUCTION_YEAR = {
  berry101: 1972, // Yogi Berra
  robif103: 1982, // Frank Robinson
  mccow101: 1986, // Willie McCovey
  bencj101: 1989, // Johnny Bench
  carls001: 1994, // Steve Carlton
  schmm001: 1995, // Mike Schmidt
  niekp001: 1997, // Phil Niekro
  lasot101: 1997, // Tom Lasorda
  suttd001: 1998, // Don Sutton
  ryann001: 1999, // Nolan Ryan
  andes101: 2000, // Sparky Anderson
  peret001: 2000, // Tony Perez
  winfd001: 2001, // Dave Winfield
  puckk001: 2001, // Kirby Puckett
  smito001: 2002, // Ozzie Smith
  murre001: 2003, // Eddie Murray
  cartg001: 2003, // Gary Carter
  ecked001: 2004, // Dennis Eckersley
  molip001: 2004, // Paul Molitor
  sandr001: 2005, // Ryne Sandberg
  boggw001: 2005, // Wade Boggs
  ripkc001: 2007, // Cal Ripken
  gwynt001: 2007, // Tony Gwynn
  hendr001: 2009, // Rickey Henderson
  dawsa001: 2010, // Andre Dawson
  herzw101: 2010, // Whitey Herzog
  alomr001: 2011, // Roberto Alomar
  larkb001: 2012, // Barry Larkin
  "cox-b103": 2014, // Bobby Cox
  thomf001: 2014, // Frank Thomas
  maddg002: 2014, // Greg Maddux
  torrj101: 2014, // Joe Torre
  larut101: 2014, // Tony La Russa
  biggc001: 2015, // Craig Biggio
  smolj001: 2015, // John Smoltz
  martp001: 2015, // Pedro Martinez
  grifk002: 2016, // Ken Griffey
  piazm001: 2016, // Mike Piazza
  rodri001: 2017, // Ivan Rodriguez
  bagwj001: 2017, // Jeff Bagwell
  raint001: 2017, // Tim Raines
  trama001: 2018, // Alan Trammell
  jonec004: 2018, // Chipper Jones
  thomj002: 2018, // Jim Thome
  hofft001: 2018, // Trevor Hoffman
  guerv001: 2018, // Vladimir Guerrero
  marte001: 2019, // Edgar Martinez
  bainh001: 2019, // Harold Baines
  smitl001: 2019, // Lee Smith
  rivem002: 2019, // Mariano Rivera
  mussm001: 2019, // Mike Mussina
  hallr001: 2019, // Roy Halladay
  jeted001: 2020, // Derek Jeter
  walkl001: 2020, // Larry Walker
  simmt001: 2020, // Ted Simmons
  ortid001: 2022, // David Ortiz
  mcgrf001: 2023, // Fred McGriff
  roles001: 2023, // Scott Rolen
  belta001: 2024, // Adrian Beltre
  leylj801: 2024, // Jim Leyland
  mauej001: 2024, // Joe Mauer
  heltt001: 2024, // Todd Helton
  wagnb001: 2025, // Billy Wagner
  sabac001: 2025, // CC Sabathia
  parkd001: 2025, // Dave Parker
  suzui001: 2025, // Ichiro Suzuki
};
