// ReadingPage.js

import React, { useEffect, useState, useRef } from 'react'
import './readingPage.css'
import { getStoryById } from '../Services/storyService'
import { AudioConfig, SpeechConfig, SpeechRecognizer } from 'microsoft-cognitiveservices-speech-sdk'
import { FaMicrophone, FaMicrophoneSlash, FaSync } from 'react-icons/fa'

const sdk = require('microsoft-cognitiveservices-speech-sdk')

// Environment config
const API_KEY = process.env.REACT_APP_COG_SERVICE_KEY
const API_LOCATION = process.env.REACT_APP_COG_SERVICE_LOCATION
const speechConfig = SpeechConfig.fromSubscription(API_KEY, API_LOCATION)

// We'll keep a single Speech Recognizer globally
let recognizer = null

function ReadingPage() {
  //----------------------------------------------------------------------
  // 1) Load the story data with multiple pages
  //----------------------------------------------------------------------
  const storyId = 1
  const story = getStoryById(storyId)
  const totalPages = story.Pages.length

  //----------------------------------------------------------------------
  // 2) Current page
  //----------------------------------------------------------------------
  const [currentPageIndex, setCurrentPageIndex] = useState(0)

  //----------------------------------------------------------------------
  // 3) Story words for current page
  //----------------------------------------------------------------------
  const [storyWords, setStoryWords] = useState([])

  // Reading state
  const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0)
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const [isFrozen, setIsFrozen] = useState(false)

  //----------------------------------------------------------------------
  // 4) Recognized text (debug)
  //----------------------------------------------------------------------
  const [recognizedTextPartial, setRecognizedTextPartial] = useState("")
  const [recognizedTextFinal, setRecognizedTextFinal] = useState("")
  const [isRecognizing, setIsRecognizing] = useState(false)
  const recognizedTokensSoFarRef = useRef([])

  // Ref for debug textarea
  const textRef = useRef(null)

  //----------------------------------------------------------------------
  // 5) On mount: setup mic & recognizer, load initial page
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

    // Load page 0
    loadPage(0)

    return () => {
      if (recognizer) {
        recognizer.stopContinuousRecognitionAsync()
      }
    }
    // eslint-disable-next-line
  }, [])

  //----------------------------------------------------------------------
  // 6) Create Speech Recognizer
  //----------------------------------------------------------------------
  const createSpeechRecognizer = (audioStream) => {
    const audioConfig = AudioConfig.fromStreamInput(audioStream)
    recognizer = new SpeechRecognizer(speechConfig, audioConfig)

    // PARTIAL results
    recognizer.recognizing = (sender, event) => {
      const partial = event.result.text
      setRecognizedTextPartial(partial)

      const newPartialTokens = tokenizeAndNormalize(partial)
      const oldTokens = recognizedTokensSoFarRef.current

      let overlapCount = 0
      while (
        overlapCount < oldTokens.length &&
        overlapCount < newPartialTokens.length &&
        oldTokens[overlapCount] === newPartialTokens[overlapCount]
      ) {
        overlapCount++
      }
      const freshTokens = newPartialTokens.slice(overlapCount)

      if (freshTokens.length > 0) {
        handleNewRecognizedTokens(freshTokens)
      }

      recognizedTokensSoFarRef.current = newPartialTokens

      if (textRef.current) {
        textRef.current.scrollTop = textRef.current.scrollHeight
      }
    }

    // FINAL results
    recognizer.recognized = (sender, event) => {
      if (event.result.reason === sdk.ResultReason.RecognizedSpeech) {
        setRecognizedTextFinal(prev => prev + event.result.text + " ")
        setRecognizedTextPartial("")
        recognizedTokensSoFarRef.current = []
      } else if (event.result.reason === sdk.ResultReason.NoMatch) {
        console.log("NOMATCH: Speech could not be recognized.")
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
  // 7) Start / Stop
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
      setRecognizedTextPartial("")
      setRecognizedTextFinal("")
      startRecognizer()
    } else {
      stopRecognizer()
    }
  }

  //----------------------------------------------------------------------
  // 8) Load a specific page
  //----------------------------------------------------------------------
  const loadPage = (pageIndex) => {
    const pageData = story.Pages[pageIndex]
    const text = pageData.Text

    const words = parseTextIntoWordObjects(text)
    setStoryWords(words)

    setCurrentParagraphIndex(0)
    setCurrentWordIndex(0)
    setIsFrozen(false)
    recognizedTokensSoFarRef.current = []
  }

  //----------------------------------------------------------------------
  // 9) Next / Previous
  //----------------------------------------------------------------------
  const handleNextPage = () => {
    if (currentPageIndex < totalPages - 1) {
      const nextIndex = currentPageIndex + 1
      setCurrentPageIndex(nextIndex)
      loadPage(nextIndex)
    }
  }

  const handlePreviousPage = () => {
    if (currentPageIndex > 0) {
      const prevIndex = currentPageIndex - 1
      setCurrentPageIndex(prevIndex)
      loadPage(prevIndex)
    }
  }

  //----------------------------------------------------------------------
  // 10) Processing recognized tokens
  //----------------------------------------------------------------------
  const handleNewRecognizedTokens = (tokens) => {
    if (!tokens || tokens.length === 0) return

    setStoryWords(prev => {
      const updated = prev.map(par => par.slice())

      let p = currentParagraphIndex
      let w = currentWordIndex
      let frozen = isFrozen

      for (const token of tokens) {
        // Move to next unfinished word
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
          break
        }
        if (p >= updated.length) {
          // All words in this page are correct
          break
        }

        const target = updated[p][w]
        if (frozen) {
          if (token === target.normalized) {
            updated[p][w] = { ...target, status: "correct" }
            w++
            frozen = false
          }
          break
        } else {
          // Not frozen => normal check
          if (token === target.normalized) {
            updated[p][w] = { ...target, status: "correct" }
            w++
          } else {
            updated[p][w] = { ...target, status: "incorrect" }
            frozen = true
            break
          }
        }
      }

      setCurrentParagraphIndex(p)
      setCurrentWordIndex(w)
      setIsFrozen(frozen)

      const pageComplete = checkPageComplete(updated)
      if (pageComplete) {
        if (currentPageIndex < totalPages - 1) {
          handleNextPage()
        } else {
          console.log("You've finished the last page!")
        }
      }

      return updated
    })
  }

  function checkPageComplete(wordData) {
    for (let par of wordData) {
      for (let word of par) {
        if (word.status !== 'correct') return false
      }
    }
    return true
  }

  //----------------------------------------------------------------------
  // 11) Parse text -> paragraphs -> words
  //----------------------------------------------------------------------
  function parseTextIntoWordObjects(text) {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(Boolean)

    return paragraphs.map(par => {
      const rawWords = par.split(/\s+/)
      return rawWords.map(word => ({
        text: word,
        normalized: normalize(word),
        status: "pending"
      }))
    })
  }

  function tokenizeAndNormalize(str) {
    if (!str) return []
    return str.split(/\s+/).map(t => normalize(t)).filter(Boolean)
  }

  function normalize(str) {
    return str.replace(/[^\w\s]|_/g, "").toLowerCase()
  }

  //----------------------------------------------------------------------
  // 12) Reset
  //----------------------------------------------------------------------
  const handleReset = () => {
    stopRecognizer()
    loadPage(currentPageIndex)
    setRecognizedTextPartial("")
    setRecognizedTextFinal("")
    setIsRecognizing(false)
  }

  //----------------------------------------------------------------------
  // 13) Render story text
  //----------------------------------------------------------------------
  const renderStoryParagraphs = () => {
    return storyWords.map((paragraph, pIndex) => (
      <p key={pIndex}>
        {paragraph.map((wordObj, wIndex) => {
          const { text, status } = wordObj
          let className = "word"
          if (status === "correct") className += " correct"
          if (status === "incorrect") className += " incorrect"
          return (
            <span key={wIndex} className={className}>
              {text}{" "}
            </span>
          )
        })}
      </p>
    ))
  }

  //----------------------------------------------------------------------
  // 14) Hero image
  //----------------------------------------------------------------------
  const heroImagePath = `/story-images/s${storyId}p${currentPageIndex}.webp`

  return (
    <div className="reading-page">
      <img
        src={heroImagePath}
        alt={`Page ${currentPageIndex + 1}`}
        className="hero-image"
      />

      <h2 style={{ marginBottom: '1rem' }}>{story.Title}</h2>

      <div className="story-text">
        {renderStoryParagraphs()}
      </div>

      {/* 
        Button row: 
        - Prev (discrete) on far left
        - Mic + Reset (round icons) in center
        - Next (discrete) on far right
      */}
      <div className="button-row">

        {/* Previous button or empty placeholder */}
        {currentPageIndex > 0 ? (
          <button 
            className="discrete"
            onClick={handlePreviousPage}
          >
            Previous
          </button>
        ) : (
          <div></div>
        )}

        {/* Center Buttons */}
        <div className="center-buttons">
          <button 
            className="circle-button mic-button"
            onClick={toggleRecognizer}
            title={isRecognizing ? "Stop" : "Start"}
          >
            {isRecognizing ? <FaMicrophoneSlash /> : <FaMicrophone />}
          </button>

          <button 
            className="circle-button reset-button"
            onClick={handleReset}
            title="Reset"
          >
            <FaSync />
          </button>
        </div>

        {/* Next button or placeholder */}
        {currentPageIndex < totalPages - 1 ? (
          <button 
            className="discrete"
            onClick={handleNextPage}
          >
            Next
          </button>
        ) : (
          <div></div>
        )}

      </div>

      {/* Debug textarea */}
      <div style={{ marginTop: '1rem' }}>
        <label>Debug / Transcription</label>
        <textarea
          className="debug-textarea"
          readOnly
          value={recognizedTextFinal + recognizedTextPartial}
          ref={textRef}
        />
      </div>
    </div>
  )
}

export default ReadingPage
