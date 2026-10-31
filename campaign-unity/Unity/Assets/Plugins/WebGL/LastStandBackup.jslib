mergeInto(LibraryManager.library, {
  $STLastStandBackup: {
    limit: 131072,
    state: function () {
      return Module.lastStandBackupRequests || (Module.lastStandBackupRequests = Object.create(null));
    },
    finish: function (request, status, payload) {
      var state = STLastStandBackup.state();
      if (state[request.receiver] !== request) return;
      delete state[request.receiver];
      if (request.timer) clearTimeout(request.timer);
      if (request.input) request.input.remove();
      if (request.reader && request.reader.readyState === 1) request.reader.abort();
      SendMessage(request.receiver, 'BackupTransferCompleted', request.id + '|' + status + '|' + (payload || ''));
    },
    begin: function (receiver, id) {
      var state = STLastStandBackup.state();
      if (!/^LastStandBackupTransport-[1-9][0-9]*$/.test(receiver) || id <= 0 || (id | 0) !== id) return null;
      if (state[receiver]) { SendMessage(receiver, 'BackupTransferCompleted', id + '|error|'); return null; }
      var request = { receiver: receiver, id: id };
      state[receiver] = request;
      return request;
    },
    valid: function (bytes) {
      if (!bytes.length || bytes.length > STLastStandBackup.limit) return false;
      try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); return true; }
      catch (_) { return false; }
    },
    encode: function (bytes) {
      var binary = '';
      for (var offset = 0; offset < bytes.length; offset += 4096)
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(offset + 4096, bytes.length)));
      return btoa(binary);
    }
  },
  LastStandBackup_Available: function () {
    return typeof FileReader !== 'undefined' && typeof Blob !== 'undefined' && typeof TextDecoder !== 'undefined' &&
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? 1 : 0;
  },
  LastStandBackup_Import__deps: ['$STLastStandBackup'],
  LastStandBackup_Import: function (receiverPointer, id) {
    var request = STLastStandBackup.begin(UTF8ToString(receiverPointer), id);
    if (!request) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) {
        STLastStandBackup.finish(request, 'error'); return;
      }
      var input = document.createElement('input');
      request.input = input;
      input.type = 'file'; input.accept = '.laststand,application/octet-stream'; input.multiple = false;
      input.style.display = 'none';
      input.addEventListener('cancel', function () { STLastStandBackup.finish(request, 'cancel'); });
      input.addEventListener('change', function () {
        if (STLastStandBackup.state()[request.receiver] !== request) return;
        if (!input.files || input.files.length === 0) { STLastStandBackup.finish(request, 'cancel'); return; }
        var file = input.files[0];
        if (input.files.length !== 1 || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > STLastStandBackup.limit) {
          STLastStandBackup.finish(request, 'error'); return;
        }
        var reader = new FileReader(); request.reader = reader;
        reader.onerror = function () { STLastStandBackup.finish(request, 'error'); };
        reader.onabort = function () { STLastStandBackup.finish(request, 'cancel'); };
        reader.onload = function () {
          if (STLastStandBackup.state()[request.receiver] !== request) return;
          try {
            var bytes = new Uint8Array(reader.result);
            if (!STLastStandBackup.valid(bytes)) { STLastStandBackup.finish(request, 'error'); return; }
            STLastStandBackup.finish(request, 'ok', STLastStandBackup.encode(bytes));
          } catch (_) { STLastStandBackup.finish(request, 'error'); }
        };
        request.timer = setTimeout(function () { STLastStandBackup.finish(request, 'error'); }, 30000);
        reader.readAsArrayBuffer(file);
      });
      document.body.appendChild(input);
      input.click();
    } catch (_) { STLastStandBackup.finish(request, 'error'); }
  },
  LastStandBackup_Export__deps: ['$STLastStandBackup'],
  LastStandBackup_Export: function (receiverPointer, id, dataPointer, namePointer) {
    var request = STLastStandBackup.begin(UTF8ToString(receiverPointer), id);
    if (!request) return;
    var url = null, link = null;
    try {
      if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive)
        throw new Error('Gesture required');
      var encoded = UTF8ToString(dataPointer), name = UTF8ToString(namePointer);
      if (encoded.length > 174764 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 !== 0 ||
          !/^last-stand-backup-[0-9]{8}-[0-9]{6}\.laststand$/.test(name)) throw new Error('Invalid transfer');
      var binary = atob(encoded), bytes = new Uint8Array(binary.length);
      for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      if (!STLastStandBackup.valid(bytes) || STLastStandBackup.encode(bytes) !== encoded) throw new Error('Invalid transfer');
      url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      link = document.createElement('a'); link.href = url; link.download = name; link.style.display = 'none';
      document.body.appendChild(link); link.click(); link.remove(); link = null;
      // Browser download admission is observable; the browser owns subsequent
      // save/cancel handling. This does not claim a confirmed durable disk write.
      STLastStandBackup.finish(request, 'ok');
    } catch (_) { STLastStandBackup.finish(request, 'error'); }
    finally {
      if (link) link.remove();
      if (url) { var completedUrl = url; setTimeout(function () { URL.revokeObjectURL(completedUrl); }, 1000); }
    }
  },
  LastStandBackup_Cancel__deps: ['$STLastStandBackup'],
  LastStandBackup_Cancel: function (receiverPointer, id) {
    var receiver = UTF8ToString(receiverPointer), request = STLastStandBackup.state()[receiver];
    if (request && request.id === id) STLastStandBackup.finish(request, 'cancel');
  }
});
