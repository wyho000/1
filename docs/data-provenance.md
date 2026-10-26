# Female fly brain data and model scope

The lower-right brain map uses real spatial anchor coordinates and cell-class
annotations from the **FlyWire female adult Drosophila brain (FAFB), segmentation
release 783**. The browser loads a compact, local derived dataset; no API token or
runtime connection to FlyWire is required.

## Reproducible source

- Repository: [flyconnectome/flywire_annotations](https://github.com/flyconnectome/flywire_annotations).
- Annotation release: `v2.0.0`.
- Pinned commit: `327ae7bdcc18c7a6a5ac014a4bfa9c7560fe854e`.
- Input: [`Supplemental_file1_neuron_annotations.tsv`](https://raw.githubusercontent.com/flyconnectome/flywire_annotations/327ae7bdcc18c7a6a5ac014a4bfa9c7560fe854e/supplemental_files/Supplemental_file1_neuron_annotations.tsv).
- Input size: 24,346,961 bytes; 139,255 unique neuron root IDs.
- SHA-256: `5cbd94da723111ad8512fca3aeb93eeb22dd9682d93995c7f6a23f05f68cb0eb`.
- Bundled output: `public/data/flywire-brain.json`.

Regenerate using Python's standard library:

```sh
cd /workspace/1
python3 scripts/build-brain-data.py
```

An already-downloaded source can be used with `--source-file /path/to/file.tsv`.
Both paths verify the exact input checksum before writing the output. The input
is not bundled; only a deterministic 7,000-point sample, matched source root IDs,
class counts, and provenance are included. IDs remain strings to preserve 64-bit
precision in JavaScript. Sampling is enriched for the circuits highlighted by
the interface, so **point density is not an unbiased estimate of neuron density**.

## What the map represents

`pos_x`, `pos_y`, and `pos_z` are upstream neuronal **anchor coordinates**, typically
on the neuron backbone. They are converted from 4×4×40 nm voxel coordinates to
micrometers using `[0.004, 0.004, 0.04]`. They are neither synapse positions nor
complete neuron shapes. Neuron side is the annotation's soma side for intrinsic
neurons or nerve-entry side for sensory/ascending neurons, not an inference from
point position.

The following groups are defined by actual annotation classes, not by arbitrary
spatial lobes:

| Map group | Inclusion rule |
| --- | --- |
| AL | `olfactory`, `ALPN`, `ALLN`, `ALIN`, or `ALON` cell class |
| LH | `LHLN` or `LHCENT` cell class |
| MB | `Kenyon_Cell`, `MBON`, or `MBIN` cell class |
| CX | `CX` cell class |
| DN | `descending` super class |
| OTHER | Remaining annotations |

These are broad **circuit groups**, not exact neuropil segmentation masks. For
example, AL includes olfactory sensory neurons, and MB includes output neurons
whose anchor can lie outside a mushroom-body lobe. Left/right activity can be
assigned using the preserved side annotation.

## Biological model limitations

The app's chemical sensing, autonomous movement, adaptation, internal state, and
activity colors are an illustrative reduced model. **No synapse edge list or
empirical connection weights are included, and the simulation is not a full
emulation of 139,255 neurons.** The data establish the female brain map and class
identity; they do not establish that the modeled activity matches living flies.
Concentrations and activity are normalized model units, not calibrated laboratory
measurements. The system does not claim consciousness or human-like thought.

The upstream README directs full synapse/edge downloads to
[Zenodo record 10676866](https://zenodo.org/records/10676866). That endpoint was
unavailable through the setup environment's network policy. No synthetic edge
counts have been substituted or represented as empirical evidence.

## Attribution and license notes

- Schlegel et al. (2024), *Whole-brain annotation and multi-connectome cell typing
  of Drosophila*, Nature. [doi:10.1038/s41586-024-07686-5](https://doi.org/10.1038/s41586-024-07686-5).
- Dorkenwald et al. (2024), *Neuronal wiring diagram of an adult brain*, Nature.
  [doi:10.1038/s41586-024-07558-y](https://doi.org/10.1038/s41586-024-07558-y).

The pinned GitHub repository did not expose a standalone `LICENSE`, `LICENSE.md`,
or `LICENSE.txt`. This project therefore makes no claim that the source is CC0
or covered by a particular permissive data license. The numerical derivative
retains exact source attribution and citations. Refer to the upstream authors
and publication terms for further redistribution requirements.
