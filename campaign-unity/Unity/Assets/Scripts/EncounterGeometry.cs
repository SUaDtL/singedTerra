using System;

namespace SingedTerra.Encounter
{
    public readonly struct EncounterPoint
    {
        public readonly int X,Z;
        internal EncounterPoint(int x,int z){X=x;Z=z;}
    }

    // One model unit is 1/1000 world unit. Integer formation coordinates keep
    // blast membership identical across hosts and align the rendered formation.
    public static class EncounterGeometry
    {
        const int Scale=1000000;
        static readonly int[] sin={0,707107,1000000,707107,0,-707107,-1000000,-707107};
        static readonly int[] cos={1000000,707107,0,-707107,-1000000,-707107,0,707107};
        // Four columns match the existing visual offsets: +.63,+.21,-.21,-.63 radians.
        static readonly int[] offsetSin={589145,208460,-208460,-589145};
        static readonly int[] offsetCos={808028,978031,978031,808028};
        public static EncounterPoint Position(int lane,int id,int distance)
        {
            if(lane<0||lane>=8||id<1||distance<0||distance>1000000000)throw new ArgumentOutOfRangeException(nameof(lane));
            int column=(id-1)%4;
            long x=((long)sin[lane]*offsetCos[column]+(long)cos[lane]*offsetSin[column])/Scale;
            long z=((long)cos[lane]*offsetCos[column]-(long)sin[lane]*offsetSin[column])/Scale;
            return new EncounterPoint((int)(x*distance/Scale),(int)(z*distance/Scale));
        }
        public static bool WithinRadius(EncounterPoint a,EncounterPoint b,int radius)
        {
            if(radius<0||radius>1000000000)throw new ArgumentOutOfRangeException(nameof(radius));
            long dx=(long)a.X-b.X,dz=(long)a.Z-b.Z;
            return dx*dx+dz*dz<=(long)radius*radius;
        }
    }
}
