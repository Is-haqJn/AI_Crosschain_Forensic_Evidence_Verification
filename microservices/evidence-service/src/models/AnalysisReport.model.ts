import mongoose, { Document, Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for Analysis Report document
 */
export interface IAnalysisReport extends Document {
  reportId: string;
  evidenceId: string;
  analysisId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  reportType: string;
  summary: {
    confidence: number;
    anomaliesDetected: boolean;
    processingTime: number;
    modelVersion: string;
  };
  findings: Array<{
    type: string;
    severity: string;
    description: string;
    confidence: number;
    location?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      timestamp?: number;
    };
  }>;
  metadata: {
    extracted: Record<string, any>;
    inconsistencies: string[];
    missing: string[];
  };
  content: {
    text?: string;
    objects?: Array<{
      label: string;
      confidence: number;
      region?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }>;
    faces?: Array<{
      confidence: number;
      region?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }>;
    audio?: {
      duration: number;
      sampleRate: number;
      channels: number;
      format: string;
    };
  };
  modality: {
    // Image-specific fields
    image?: {
      ela: {
        score: number;
        regions: Array<{
          x: number;
          y: number;
          width: number;
          height: number;
          confidence: number;
        }>;
      };
      quality: {
        score: number;
        compression: string;
        noise: string;
        artifacts: string[];
      };
      dimensions: {
        width: number;
        height: number;
        aspectRatio: number;
      };
    };
    // Video-specific fields
    video?: {
      deepfake: {
        detected: boolean;
        confidence: number;
        techniques: string[];
        affectedFrames: number[];
      };
      motion: {
        consistent: boolean;
        anomalies: Array<{
          timestamp: number;
          description: string;
          confidence: number;
        }>;
      };
      technical: {
        duration: number;
        fps: number;
        codec: string;
        bitrate: number;
        resolution: string;
      };
    };
    // Document-specific fields
    document?: {
      structure: {
        pageCount: number;
        sectionCount: number;
        tableCount: number;
        imageCount: number;
      };
      plagiarism: {
        detected: boolean;
        similarityScore: number;
        matchedSources: string[];
        segments: string[];
      };
      authenticity: {
        signatures: Array<{
          type: string;
          valid: boolean;
          name: string;
        }>;
        creationSoftware: string;
        modificationHistory: Array<{
          timestamp: string;
          action: string;
        }>;
      };
    };
    // Audio-specific fields
    audio?: {
      voice: {
        speakerCount: number;
        speakers: Array<{
          id: string;
          confidence: number;
          characteristics: Record<string, any>;
        }>;
      };
      spectrum: {
        frequencyRanges: Record<string, number>;
        anomalies: string[];
      };
      noise: {
        level: number;
        types: string[];
        signalToNoiseRatio: number;
      };
      technical: {
        duration: number;
        sampleRate: number;
        channels: number;
        format: string;
        bitDepth: number;
        codec: string;
        bitrate: number;
        quality: string;
      };
    };
  };
  rawResults: Record<string, any>;
}

/**
 * Schema for Analysis Report
 */
const AnalysisReportSchema = new Schema<IAnalysisReport>(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
    },
    evidenceId: {
      type: String,
      required: true,
      index: true,
    },
    analysisId: {
      type: String,
      required: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
    reportType: {
      type: String,
      required: true,
      enum: ['image', 'video', 'document', 'audio'],
    },
    summary: {
      confidence: {
        type: Number,
        required: true,
        default: 0,
      },
      anomaliesDetected: {
        type: Boolean,
        required: true,
        default: false,
      },
      processingTime: {
        type: Number,
        default: 0,
      },
      modelVersion: {
        type: String,
        default: '1.0.0',
      },
    },
    findings: [
      {
        type: {
          type: String,
          required: true,
        },
        severity: {
          type: String,
          enum: ['low', 'medium', 'high'],
          default: 'medium',
        },
        description: {
          type: String,
          required: true,
        },
        confidence: {
          type: Number,
          required: true,
        },
        location: {
          x: Number,
          y: Number,
          width: Number,
          height: Number,
          timestamp: Number,
        },
      },
    ],
    metadata: {
      extracted: {
        type: Schema.Types.Mixed,
        default: {},
      },
      inconsistencies: {
        type: [String],
        default: [],
      },
      missing: {
        type: [String],
        default: [],
      },
    },
    content: {
      text: String,
      objects: [
        {
          label: String,
          confidence: Number,
          region: {
            x: Number,
            y: Number,
            width: Number,
            height: Number,
          },
        },
      ],
      faces: [
        {
          confidence: Number,
          region: {
            x: Number,
            y: Number,
            width: Number,
            height: Number,
          },
        },
      ],
      audio: {
        duration: Number,
        sampleRate: Number,
        channels: Number,
        format: String,
      },
    },
    modality: {
      image: {
        ela: {
          score: Number,
          regions: [
            {
              x: Number,
              y: Number,
              width: Number,
              height: Number,
              confidence: Number,
            },
          ],
        },
        quality: {
          score: Number,
          compression: String,
          noise: String,
          artifacts: [String],
        },
        dimensions: {
          width: Number,
          height: Number,
          aspectRatio: Number,
        },
      },
      video: {
        deepfake: {
          detected: Boolean,
          confidence: Number,
          techniques: [String],
          affectedFrames: [Number],
        },
        motion: {
          consistent: Boolean,
          anomalies: [
            {
              timestamp: Number,
              description: String,
              confidence: Number,
            },
          ],
        },
        technical: {
          duration: Number,
          fps: Number,
          codec: String,
          bitrate: Number,
          resolution: String,
        },
      },
      document: {
        structure: {
          pageCount: Number,
          sectionCount: Number,
          tableCount: Number,
          imageCount: Number,
        },
        plagiarism: {
          detected: Boolean,
          similarityScore: Number,
          matchedSources: [String],
          segments: [String],
        },
        authenticity: {
          signatures: [
            {
              type: String,
              valid: Boolean,
              name: String,
            },
          ],
          creationSoftware: String,
          modificationHistory: [
            {
              timestamp: String,
              action: String,
            },
          ],
        },
      },
      audio: {
        voice: {
          speakerCount: Number,
          speakers: [
            {
              id: String,
              confidence: Number,
              characteristics: Schema.Types.Mixed,
            },
          ],
        },
        spectrum: {
          frequencyRanges: Schema.Types.Mixed,
          anomalies: [String],
        },
        noise: {
          level: Number,
          types: [String],
          signalToNoiseRatio: Number,
        },
        technical: {
          duration: Number,
          sampleRate: Number,
          channels: Number,
          format: String,
          bitDepth: Number,
          codec: String,
          bitrate: Number,
          quality: String,
        },
      },
    },
    rawResults: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for efficient queries
AnalysisReportSchema.index({ evidenceId: 1, createdAt: -1 });
AnalysisReportSchema.index({ analysisId: 1 });
AnalysisReportSchema.index({ reportType: 1 });
AnalysisReportSchema.index({ 'summary.anomaliesDetected': 1 });

export const AnalysisReport = mongoose.model<IAnalysisReport>('AnalysisReport', AnalysisReportSchema);
