import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('capture', Path(__file__).with_name('capture-hx711.py'))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


def fixture():
    lines = ['{"v":1,"deviceId":"DLOOP-SCALE-01"}',
             '#DIAG BEGIN mode=FULL accepted=0 startResetId=0']
    for last in [16, 32, 48, 64]:
        times = [i * 100 for i in range(last - 15, last + 1)]
        lines.append(f'#DIAG WINDOW accepted={last} count=16 firstId={last-15} '
                     f'intervals=15 dtMin=100 dtMax=100 dtAvg=100.000 '
                     f'raw={json.dumps([-29530]*16,separators=(",", ":"))} '
                     f'times={json.dumps(times,separators=(",", ":"))}')
    lines.append('#DIAG END reason=USER accepted=64 resetObserved=0 resetQueued=0 '
                 'recordsLost=0 protocolLost=0 lostReset=false')
    return '\n'.join(lines) + '\n'


class CaptureTests(unittest.TestCase):
    def test_labels_export_and_replay(self):
        with tempfile.TemporaryDirectory() as directory:
            log = Path(directory) / 'capture.log'
            log.write_text(fixture(), encoding='utf-8')
            for label in capture.LABELS:
                path = Path(directory) / (label + '.csv')
                self.assertEqual(capture.export(log, path, label, 'Synthetic wire test only'), 64)
                result = capture.replay(path)['results'][0]
                self.assertEqual(result['samples'], 64)
                self.assertEqual(result['maxHold'], 4)
                self.assertEqual(result['movement']['labelledSamples'], 64 if label in ['LOADING', 'UNLOADING'] else 0)
                with self.assertRaises(FileExistsError):
                    capture.export(log, path, label, 'test')
                path.write_text(path.read_text() + '\n')
                with self.assertRaisesRegex(ValueError, 'hash'):
                    capture.replay(path)

    def test_incomplete_captures_never_export(self):
        original = fixture()
        variants = [original.replace('recordsLost=0', 'recordsLost=1'),
                    original.replace('protocolLost=0', 'protocolLost=1'),
                    original.replace('reason=USER', 'reason=OUTPUT_OVERFLOW'),
                    original[:original.index('#DIAG END')],
                    original.replace('firstId=17', 'firstId=18'),
                    '\n'.join(l for l in original.splitlines() if 'accepted=16 count' not in l),
                    original.replace('END reason=USER accepted=64', 'END reason=USER accepted=65'),
                    original.replace('mode=FULL', 'mode=SUMMARY')]
        with tempfile.TemporaryDirectory() as directory:
            for i, text in enumerate(variants):
                log = Path(directory) / f'{i}.log'
                path = Path(directory) / f'{i}.csv'
                log.write_text(text, encoding='utf-8')
                with self.assertRaises(subprocess.CalledProcessError):
                    capture.export(log, path, 'EMPTY_STATIC', 'test')
                self.assertFalse(path.exists())


if __name__ == '__main__':
    unittest.main()
