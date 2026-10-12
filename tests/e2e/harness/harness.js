// Mounts the shared components on their own, so E2E tests can exercise them without a tool
// screen around them. Tool flows and the worker are tested through the real app.
import '../../../src/styles/main.css';
import '../../../src/styles/components.css';
import { userMessageFor } from '../../../src/lib/errorMessages.js';
import { createDropzone } from '../../../src/ui/components/dropzone.js';
import { createFileList } from '../../../src/ui/components/fileList.js';
import { showToast } from '../../../src/ui/components/toast.js';

const fileList = createFileList();

const dropzone = createDropzone({
  onFiles(accepted, rejected) {
    fileList.add(accepted);
    for (const { file, code } of rejected) {
      showToast(userMessageFor({ code }, file.name), { type: 'error' });
    }
  },
});

document.getElementById('app').append(dropzone.element, fileList.element);
