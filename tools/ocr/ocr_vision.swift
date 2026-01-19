#!/usr/bin/env swift
import Foundation
import Vision
import PDFKit
import AppKit

func writeOutput(_ text: String, to path: String) {
  try? text.write(to: URL(fileURLWithPath: path), atomically: true, encoding: .utf8)
}

guard CommandLine.arguments.count >= 3 else {
  exit(2)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]
let pageLimit = Int(ProcessInfo.processInfo.environment["OCR_PAGE_LIMIT"] ?? "10") ?? 10
let lowerPath = inputPath.lowercased()
var outputChunks: [String] = []

func recognizeText(from image: NSImage) {
  guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    return
  }
  let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  try? handler.perform([request])
  let observations = request.results ?? []
  let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
  if !text.isEmpty {
    outputChunks.append(text)
  }
}

if lowerPath.hasSuffix(".pdf") {
  guard let document = PDFDocument(url: URL(fileURLWithPath: inputPath)) else {
    exit(3)
  }
  let total = min(document.pageCount, pageLimit)
  if total == 0 {
    writeOutput("", to: outputPath)
    exit(0)
  }
  for index in 0..<total {
    guard let page = document.page(at: index) else { continue }
    let bounds = page.bounds(for: .mediaBox)
    let scale: CGFloat = 2.0
    let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
    let image = NSImage(size: size)
    image.lockFocus()
    NSColor.white.set()
    NSRect(origin: .zero, size: size).fill()
    if let context = NSGraphicsContext.current?.cgContext {
      context.saveGState()
      context.translateBy(x: 0, y: size.height)
      context.scaleBy(x: scale, y: -scale)
      page.draw(with: .mediaBox, to: context)
      context.restoreGState()
    }
    image.unlockFocus()
    recognizeText(from: image)
  }
} else {
  guard let image = NSImage(contentsOf: URL(fileURLWithPath: inputPath)) else {
    exit(3)
  }
  recognizeText(from: image)
}

writeOutput(outputChunks.joined(separator: "\n\n"), to: outputPath)
