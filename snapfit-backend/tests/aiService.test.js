jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const { analyzeImage } = require('../src/services/aiService');

process.env.AI_SERVICE_URL = 'http://ai.test';

// The multipart body analyzeImage sent to the AI service, as text.
function sentBody() {
  const [url, form] = axios.post.mock.calls[0];
  expect(url).toBe('http://ai.test/analyze');
  return form.getBuffer().toString('latin1');
}

const countFields = (body, name) => body.split(`name="${name}"`).length - 1;

beforeEach(() => {
  axios.post.mockReset();
  axios.post.mockResolvedValue({ data: { framesUsed: 3 } });
});

describe('analyzeImage', () => {
  it('sends each extra frame as a repeated frames field next to the image', async () => {
    const result = await analyzeImage(Buffer.from('main'), { sizes: [] }, {
      userHeight: 178,
      frames: [Buffer.from('frame-a'), Buffer.from('frame-b')],
    });

    const body = sentBody();
    expect(countFields(body, 'image')).toBe(1);
    expect(countFields(body, 'frames')).toBe(2);
    expect(body).toContain('frame-a');
    expect(body).toContain('frame-b');
    expect(result.framesUsed).toBe(3);
  });

  it('sends no frames field by default', async () => {
    await analyzeImage(Buffer.from('main'), { sizes: [] }, { userHeight: 178 });

    expect(countFields(sentBody(), 'frames')).toBe(0);
  });
});
