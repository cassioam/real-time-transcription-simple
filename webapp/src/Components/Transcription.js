import React, { useEffect, useState, useRef } from 'react'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Stack from 'react-bootstrap/Stack'
import { AudioConfig, SpeechConfig, SpeechRecognizer } from 'microsoft-cognitiveservices-speech-sdk'

const sdk = require("microsoft-cognitiveservices-speech-sdk")

// Use your environment vars or hard-code them:
const API_KEY = process.env.REACT_APP_COG_SERVICE_KEY
const API_LOCATION = process.env.REACT_APP_COG_SERVICE_LOCATION
const speechConfig = SpeechConfig.fromSubscription(API_KEY, API_LOCATION)

// We'll keep this as a global variable
let recognizer = null

function Transcription() {

  //----------------------------------------------------------------------
  // 1) Story Text and Data
  //----------------------------------------------------------------------
  const storyText = `
Mia woke up early and ran outside to see the bright morning sun. She loved to explore the forest near her home, listening to birds and spotting little creatures. That day, she noticed a new path lined with shiny stones. She felt excited and a little nervous, but she followed the stones into the forest.

Soon, Mia found a hidden pond. It shimmered like a mirror, and tall trees stood guard around it. She saw a turtle resting on a log. Gently, she touched the turtle’s shell. It blinked and started walking toward a large rock. Mia felt a burst of curiosity and followed.

Behind the rock, Mia discovered a small wooden box. Carefully, she opened it and found a note that read, “Always be kind and brave.” Mia smiled and tucked the note in her pocket. Heading home, she knew her forest adventure would not be her last, and she felt proud of her courage and kindness.
  `.trim()

  // Normalize to remove punctuation, lowercase
  const normalize = (str) => {
    return str
      .replace(/[^\w\s]|_/g, "")  // remove punctuation
      .toLowerCase()
  }

  // Parse the story into a 2D array of objects: { text, normalized, status }
  const parseStoryIntoWordObjects = (text) => {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)

    return paragraphs.map(par => {
      const rawWords = par.split(/\s+/)
      return rawWords.map(word => ({
        text: word,
        normalized: normalize(word),
        status: "pending"  // or "correct"/"incorrect"
      }))
    })
  }

  const [storyWords, setStoryWords] = useState(parseStoryIntoWordObjects(storyText))

  //----------------------------------------------------------------------
  // 2) Track reading position and freeze state
  //----------------------------------------------------------------------
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [isFrozen, setIsFrozen] = useState(false)

  //----------------------------------------------------------------------
  // 3) Recognized text for debugging (partial vs final)
  //----------------------------------------------------------------------
  const [recognizedTextPartial, setRecognizedTextPartial] = useState("")
  const [recognizedTextFinal, setRecognizedTextFinal] = useState("")
  const [isRecognizing, setIsRecognizing] = useState(false)

  //----------------------------------------------------------------------
  // 4) Keep track of old partial tokens
  //----------------------------------------------------------------------
  const recognizedTokensSoFarRef = useRef([])

  // A ref to the debug textarea for auto-scroll
  const textRef = useRef(null)

  //----------------------------------------------------------------------
  // 5) On mount, set up the mic & recognizer
  //----------------------------------------------------------------------
  useEffect(() => {
    const constraints = { audio: true, video: false }
    navigator.mediaDevices.getUserMedia(constraints)
      .then(stream => {
        createSpeechRecognizer(stream)
      })
      .catch(err => {
        alert("Could not access microphone.")
        console.error(err)
      })

    return () => {
      if (recognizer) {
        recognizer.stopContinuousRecognitionAsync()
      }
    }
  }, [])

  //----------------------------------------------------------------------
  // 6) Create the Speech Recognizer
  //----------------------------------------------------------------------
  const createSpeechRecognizer = (audioStream) => {
    const audioConfig = AudioConfig.fromStreamInput(audioStream)
    recognizer = new SpeechRecognizer(speechConfig, audioConfig)

    // PARTIAL results
    recognizer.recognizing = (sender, event) => {
      const partial = event.result.text
      setRecognizedTextPartial(partial)

      // Convert partial to tokens
      const newPartialTokens = tokenizeAndNormalize(partial)
      const oldTokens = recognizedTokensSoFarRef.current

      // Count how many tokens overlap
      let overlapCount = 0
      while (
        overlapCount < oldTokens.length &&
        overlapCount < newPartialTokens.length &&
        oldTokens[overlapCount] === newPartialTokens[overlapCount]
      ) {
        overlapCount++
      }
      // Fresh tokens after the overlap
      const freshTokens = newPartialTokens.slice(overlapCount)

      // Process them
      if (freshTokens.length > 0) {
        handleNewRecognizedTokens(freshTokens)
      }

      recognizedTokensSoFarRef.current = newPartialTokens

      // Auto-scroll
      if (textRef.current) {
        textRef.current.scrollTop = textRef.current.scrollHeight
      }
    }

    // FINAL results
    recognizer.recognized = (sender, event) => {
      if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
        const finalText = event.result.text
        setRecognizedTextFinal(prev => prev + finalText + " ")

        // Clear partial
        setRecognizedTextPartial("")
        recognizedTokensSoFarRef.current = []
      } else if (event.result.reason === sdk.ResultReason.NoMatch) {
        console.log("NOMATCH: Speech not recognized.")
      }
    }

    recognizer.canceled = (sender, event) => {
      console.log("RECOGNIZER CANCELED: ", event.reason)
      if (event.reason === sdk.CancellationReason.Error) {
        console.error("ErrorCode:", event.errorCode)
        console.error("ErrorDetails:", event.errorDetails)
      }
      recognizer.stopContinuousRecognitionAsync()
    }

    recognizer.sessionStopped = (sender, event) => {
      recognizer.stopContinuousRecognitionAsync()
    }
  }

  //----------------------------------------------------------------------
  // 7) Start/Stop
  //----------------------------------------------------------------------
  const startRecognizer = () => {
    if (!recognizer) return
    setIsRecognizing(true)
    recognizedTokensSoFarRef.current = []
    recognizer.startContinuousRecognitionAsync()
  }

  const stopRecognizer = () => {
    if (!recognizer) return
    setIsRecognizing(false)
    recognizer.stopContinuousRecognitionAsync()
  }

  const toggleRecognizer = () => {
    if (!isRecognizing) {
      // Clear debug text on start if you want
      setRecognizedTextPartial("")
      setRecognizedTextFinal("")
      startRecognizer()
    } else {
      stopRecognizer()
    }
  }

  //----------------------------------------------------------------------
  // 8) Handle newly recognized tokens
  //    "Frozen" logic fix: if a word is misread, we freeze immediately
  //    and do NOT process further tokens in this chunk.
  //----------------------------------------------------------------------
  const handleNewRecognizedTokens = (tokens) => {
    if (!tokens || tokens.length === 0) return

    setStoryWords(prev => {
      const updated = prev.map(par => par.slice()) // shallow copy

      let p = currentParagraphIndex
      let w = currentWordIndex
      let frozen = isFrozen

      for (const token of tokens) {
        // Move to the next "pending/incorrect" word (skipping any "correct" ones):
        while (p < updated.length) {
          if (w >= updated[p].length) {
            p++
            w = 0
            continue
          }
          if (updated[p][w].status === "correct") {
            w++
            continue
          }
          break // found a word that is not correct => check it
        }

        // If we've finished all paragraphs, stop
        if (p >= updated.length) break

        const target = updated[p][w] // next word to read

        if (frozen) {
          // The user misread a word previously,
          // so we ONLY check if they have now corrected that same word
          if (token === target.normalized) {
            // Mark it correct, unfreeze, move on
            updated[p][w] = { ...target, status: "correct" }
            w++
            frozen = false
          }
          // Regardless of match or not, we break from this chunk
          // so the child gets a fresh chunk to confirm the fix
          break
        } else {
          // We are not frozen => normal check
          if (token === target.normalized) {
            // Correct => move forward
            updated[p][w] = { ...target, status: "correct" }
            w++
          } else {
            // Misread => mark incorrect, freeze, and break
            updated[p][w] = { ...target, status: "incorrect" }
            frozen = true
            break
          }
        }
      }

      // Update our global indexes
      setCurrentParagraphIndex(p)
      setCurrentWordIndex(w)
      setIsFrozen(frozen)

      return updated
    })
  }

  //----------------------------------------------------------------------
  // 9) Tokenize & Normalize
  //----------------------------------------------------------------------
  const tokenizeAndNormalize = (txt) => {
    if (!txt) return []
    return txt
      .split(/\s+/)
      .map(t => normalize(t))
      .filter(Boolean)
  }

  //----------------------------------------------------------------------
  // 10) Reset
  //----------------------------------------------------------------------
  const handleReset = () => {
    stopRecognizer()
    setStoryWords(parseStoryIntoWordObjects(storyText))
    setCurrentParagraphIndex(0)
    setCurrentWordIndex(0)
    setIsFrozen(false)
    setRecognizedTextPartial("")
    setRecognizedTextFinal("")
    recognizedTokensSoFarRef.current = []
    setIsRecognizing(false)
  }

  //----------------------------------------------------------------------
  // 11) Export to .txt
  //----------------------------------------------------------------------
  const export2txt = (text) => {
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.download = "transcription.txt"
    link.href = url
    link.click()
  }

  //----------------------------------------------------------------------
  // 12) Render story
  //----------------------------------------------------------------------
  const renderStoryParagraphs = () => {
    return storyWords.map((paragraph, pIndex) => (
      <p key={pIndex}>
        {paragraph.map((wordObj, wIndex) => {
          const { text, status } = wordObj
          let style = {}
          if (status === "correct") {
            style = { color: 'green', fontWeight: 'bold' }
          } else if (status === "incorrect") {
            style = { color: 'red', fontWeight: 'bold' }
          }
          return (
            <span key={wIndex} style={style}>
              {text}{" "}
            </span>
          )
        })}
      </p>
    ))
  }

  //----------------------------------------------------------------------
  // 13) JSX return
  //----------------------------------------------------------------------
  return (
    <header className="App-header">
      <Container className="mt-5">
        
        <Row className="mb-4">
          <div style={{ fontSize: '1.1rem', lineHeight: 1.6 }}>
            {renderStoryParagraphs()}
          </div>
        </Row>

        <Row>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Debug / Transcription</Form.Label>
              <Form.Control
                as="textarea"
                placeholder="Transcribed text"
                value={recognizedTextFinal + recognizedTextPartial}
                readOnly
                style={{ height: '60px', resize: 'none', fontSize: '0.8rem' }}
                ref={textRef}
              />
            </Form.Group>
            <Stack direction="horizontal" gap={2} className="mb-3">
              <Button
                variant={isRecognizing ? "secondary" : "primary"}
                onClick={toggleRecognizer}
              >
                {isRecognizing ? "Stop" : "Start"}
              </Button>

              {recognizedTextFinal.trim() && !isRecognizing &&
                <Button variant="secondary" onClick={() => export2txt(recognizedTextFinal)}>
                  Export
                </Button>
              }

              <Button variant="warning" onClick={handleReset}>
                Reset
              </Button>
            </Stack>
          </Form>
        </Row>
      </Container>
    </header>
  )
}

export default Transcription
