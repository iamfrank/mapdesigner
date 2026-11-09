import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOSMData, roadQuery } from '../src/utils/overpass.js'
import { layoutPlaceLabels } from '../src/utils/labels.js'
import { computeTransform } from '../src/utils/projection.js'

const node = (id, lon, lat, tags) => ({ type: 'node', id, lon, lat, ...(tags && { tags }) })
const way = (id, highway) => ({ type: 'way', id, nodes: [1, 2], tags: { highway } })

test('highway ways are split into road classes', () => {
  const json = { elements: [
    node(1, 0, 0), node(2, 1, 1),
    way(10, 'motorway'), way(11, 'trunk_link'), way(12, 'secondary'),
    way(13, 'residential'), way(14, 'service'), way(15, 'footway'), way(16, 'track'),
  ] }
  const r = parseOSMData(json, ['highways', 'mainRoads', 'streets', 'paths', 'tracks'])
  assert.deepEqual([...r.highways.keys()], ['w10', 'w11'])
  assert.deepEqual([...r.mainRoads.keys()], ['w12'])
  assert.deepEqual([...r.streets.keys()], ['w13', 'w14'])
  assert.deepEqual([...r.paths.keys()], ['w15'])
  assert.deepEqual([...r.tracks.keys()], ['w16'])
})

test('named place nodes become labels', () => {
  const json = { elements: [
    node(1, 12, 55.5, { place: 'town', name: 'Køge', population: '37000' }),
    node(2, 12.1, 55.6, { place: 'village' }), // unnamed
    node(3, 12.2, 55.7, { place: 'country', name: 'Danmark' }), // not a label type
  ] }
  const r = parseOSMData(json, ['places'])
  assert.deepEqual([...r.places.values()], [{ coord: [12, 55.5], name: 'Køge', place: 'town', population: 37000 }])
})

test('label layout prioritises bigger places and drops overlaps', () => {
  const ctx = { save() {}, restore() {}, measureText: (t) => ({ width: t.length * 5 }) }
  const transform = computeTransform([0, 0, 1, 1], 1000, 1000)
  const places = [
    { coord: [0.5, 0.5], name: 'Village', place: 'village' },
    { coord: [0.5, 0.5], name: 'City', place: 'city' },
    { coord: [0.2, 0.2], name: 'Hamlet', place: 'hamlet' },
    { coord: [2, 2], name: 'Off page', place: 'town' },
  ]
  const labels = layoutPlaceLabels(ctx, places, transform, { width: 1000, height: 1000 })
  assert.deepEqual(labels.map((l) => l.text), ['City', 'Hamlet'])
})

test('road layers share a single Overpass statement', () => {
  assert.deepEqual(roadQuery(['water']), [])
  assert.deepEqual(roadQuery(['highways', 'tracks']), ['way["highway"~"^(motorway|motorway_link|trunk|trunk_link|track)$"];'])
  assert.deepEqual(roadQuery(['streets', 'highways', 'mainRoads', 'paths', 'tracks']), ['way["highway"];'])
  assert.deepEqual(roadQuery(['streets', 'highways', 'mainRoads', 'paths']), ['way["highway"]["highway"!~"^(track)$"];'])
})

test('unrequested road classes are not misfiled as streets', () => {
  const json = { elements: [node(1, 0, 0), node(2, 1, 1), way(10, 'motorway'), way(11, 'residential')] }
  const r = parseOSMData(json, ['streets'])
  assert.deepEqual([...r.streets.keys()], ['w11'])
})
