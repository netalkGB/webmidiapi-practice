class Channel {
  constructor(msb, lsb, program, channel) {
    this.msb = msb
    this.lsb = lsb
    this.program = program
    this.isDrum = channel === 10
    this.channel = channel
  }
  reset () {
    this.msb = 0
    this.lsb = 0
    this.program = 0
    this.isDrum = this.channel === 10
  }
  setBankMSB (param) {
    this.msb = param
  }
  setBankLSB (param) {
    this.lsb = param
  }
  setInstrument (param) {
    this.program = param
  }
  setIsDrum (param) {
    this.isDrum = param
  }
  toString () {
    return `BankSelect MSB: ${this.msb}, BankSelect LSB: ${this.lsb}, ProgramNo: ${this.program}, isDrum?: ${this.isDrum()}`
  }
  static makePart ({ bankMSB, bankLSB, programNumber, channel }) {
    return new Channel(bankMSB, bankLSB, programNumber, channel)
  }
}
let partlist = []
for (let i = 0; i < 16; i++) {
  partlist = [...partlist, Channel.makePart({ bankMSB: 0, bankLSB: 0, programNumber: 0, channel: i + 1 })]
}
console.log(partlist)
// 
app.force55Map = false
app.partlist = partlist
app.instuments = instruments
// 

let inputs = []
let outputs = []

function sendEmulatedData (sender, channel, bmsb, blsb, progNum) {
  // channel 0 ~ 15
  const PCCh = 0xC0 + channel
  const PCProgNum = progNum
  const BSCh = 0xB0 + channel
  const instrument = instruments[progNum + 1][bmsb]
  const BSLParam = app.force55Map === true ? 1 : blsb
  const BSMParam = !instrument ? 0x00 : bmsb
  sender.send([BSCh, 0x20, BSLParam])
  sender.send([BSCh, 0x00, BSMParam])
  sender.send([PCCh, PCProgNum])
  console.log(`%cEmulate: Channel: ${channel + 1}, Bank Select LSB${app.force55Map ? '(fake)' : ''}: ${BSLParam}, Bank Select MSB${!instrument ? '(fake)' : ''}: ${BSMParam}, Program Change: ${PCProgNum}`, (app.force55Map || !instrument) ? 'color: red;' : 'color: blue;')
}

window.addEventListener("storage", function (event) {
  const { key, newValue, oldValue } = event
  console.log(event)
  console.log(key)
  if (key === 'input') {
    if (inputs[oldValue] && inputs[oldValue].onmidimessage) {
      inputs[oldValue].onmidimessage = null
    }
    const midiInput = inputs[newValue]
    const midiOutput = outputs[localStorage.output]
    if (midiInput && midiOutput) {
      setOnMidiMessage(midiInput, midiOutput)
    }
  }
  if (key === 'output') {
    const midiInput = inputs[localStorage.input]
    const midiOutput = outputs[newValue]
    if (midiInput && midiOutput) {
      setOnMidiMessage(midiInput, midiOutput)
    }
  }
})

function setOnMidiMessage (midiInput, midiOutput) {
  midiInput.onmidimessage = (ev) => {
    const { data } = ev
    if (compareArray([0xF0, 0x7E, 0x7F, 0x09, 0x01, 0xF7], data)) {
      console.log('[GM System ON]')
      for (let i = 0; i < 16; i++) {
        partlist[i].reset()
      }
    } else if (compareArray([0xF0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x00, 0x41, 0xF7], data)) {
      console.log('[GS Reset]')
      for (let i = 0; i < 16; i++) {
        partlist[i].reset()
      }
    } else if (compareArray([0xF0, 0x41, 0x10, 0x42, 0x12, 0x00, 0x00, 0x7F, 0x00, 0x01, 0xF7], data)) {
      console.log('[System Mode Set 1]')
      for (let i = 0; i < 16; i++) {
        partlist[i].reset()
      }
    } else if (compareArray([0xF0, 0x41, 0x10, 0x42, 0x12, 0x00, 0x00, 0x7F, 0x01, 0x00, 0xF7], data)) {
      console.log('[System Mode Set 2]')
      for (let i = 0; i < 16; i++) {
        partlist[i].reset()
      }
    } else if (compareArray([0xF0, 0x43, 0x10, 0x4C, 0x00, 0x00, 0x7E, 0x00, 0xF7], data)) {
      console.log('[XG Reset]')
      for (let i = 0; i < 16; i++) {
        partlist[i].reset()
      }
    } else if (data.length === 2) {
      if (data[0] >= 0xC0 && data[0] <= 0xCF) {
        const channel = data[0] - 0xC0
        const prog = data[1]

        partlist[channel].setInstrument(prog)
        console.log('[Program Change]  ' + 'Channel: ' + (channel + 1) + ', ' + 'Channel(raw): ' + (channel) + ', Parameter: ' + (prog + 1))
        sendEmulatedData(midiOutput, channel, partlist[channel].msb, partlist[channel].lsb, partlist[channel].program)
        return
      }
    } else if (data.length === 3) {
      if (data[0] >= 0xB0 && data[0] <= 0xBF) {
        const channel = data[0] - 0xB0
        const param = data[2]
        if (data[1] == 0x00) {
          partlist[channel].setBankMSB(param)
          console.log('[Bank Select MSB] ' + 'Channel: ' + (channel + 1) + ', ' + 'Channel(raw): ' + (channel) + ', Parameter: ' + param)
        } else if (data[1] == 0x20) {
          partlist[channel].setBankLSB(param)
          const moduleMap = {
            0: '---',
            1: '55MAP',
            2: '88MAP',
            3: '88PRO',
            4: '8850',
          }
          console.log('[Bank Select LSB] ' + 'Channel: ' + (channel + 1) + ', ' + 'Channel(raw): ' + (channel) + ', Parameter: ' + param + ' (' + (moduleMap[param] || '???') + ')')
        }
        midiOutput.send(data)
      }
    } else if (data.length === 11) {
      if (data[0] === 0xF0 && data[10] === 0xf7) {
        const hasChecksumError = !checkSysExChecksum(data)
        const isRolandGS = data[1] === 0x41 && data[2] === 0x10 && data[3] === 0x42 && data[4] === 0x12
        if (isRolandGS === true) {
          if (hasChecksumError === false) {
            const a = data[5]
            const b = data[6]
            const c = data[7]
            const d = data[8]
            if (a === 0x40 && c === 0x15) {
              let partNum
              if (b >= 0x11 && b <= 0x19) {
                partNum = b - 0x10
              } else if (b >= 0x1A && b <= 0x1F) {
                partNum = b - 0x10 + 1
              } else {
                partNum = 10
              }
              const partIdx = partNum - 1
              partlist[partIdx].setIsDrum(d > 0)
            }
            console.log('SysEx: ' + formatLog(data))
          } else {
            console.log('%c[CHECKSUM ERROR] SysEx: ' + formatLog(data), 'color:red;')
          }
        }
      }
    }
    midiOutput.send(data)
  }
}

function calcChecksum (d) {
  const a = d[5]
  const b = d[6]
  const c = d[7]
  const data = d[8]
  const result = 0x80 - (a + b + c + data) % 0x80
  return result
}

function checkSysExChecksum (d) {
  const checksum = d[9]
  return checksum === calcChecksum(d)
}

function successCallback (access) {
  console.log(access)
  const inputIterator = access.inputs.values()
  for (let o = inputIterator.next(); !o.done; o = inputIterator.next()) {
    inputs = [...inputs, o.value]
  }
  const outputIterator = access.outputs.values();
  for (let o = outputIterator.next(); !o.done; o = outputIterator.next()) {
    outputs = [...outputs, o.value]
  }
  console.log(inputs)
  console.log(outputs)
  const midiInput = inputs[localStorage.input]
  const midiOutput = outputs[localStorage.output]
  if (localStorage.input === undefined || localStorage.output === undefined) {
    localStorage.input = null
    localStorage.output = null
  }
  if (midiInput !== undefined && midiOutput !== undefined) {
    setOnMidiMessage(midiInput, midiOutput)
  }
}
function errorCallback (msg) {
  console.log("error: ", msg);
}

function formatLog (data) {
  let log = ''
  for (let d of data) {
    let formatted = (d).toString(16).toUpperCase()
    if (formatted.length == 1) {
      formatted = '0' + formatted
    }
    log += '0x' + formatted + ' '
  }
  return log
}

function compareArray (arrA, arrB) {
  if (arrA.length !== arrB.length) {
    return false
  }
  let result = true
  for (let i = 0; i < arrA.length; i++) {
    if (arrA[i] !== arrB[i]) {
      result = false
      break
    }
  }
  return result
}

navigator.requestMIDIAccess({ sysex: true }).then(successCallback, errorCallback);
