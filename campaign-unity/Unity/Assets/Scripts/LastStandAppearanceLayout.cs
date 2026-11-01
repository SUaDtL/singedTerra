using System;

namespace SingedTerra.LastStand
{
    // CSS-pixel geometry only. The world preview and the shared scrolling
    // editor occupy separate regions; no inventory or camera state lives here.
    public static class LastStandAppearanceLayout
    {
        public readonly struct Box
        {
            public readonly float X,Y,Width,Height;
            public float Right=>X+Width;
            public float Bottom=>Y+Height;
            public Box(float x,float y,float width,float height)
            {X=x;Y=y;Width=width;Height=height;}
        }
        public sealed class Projection
        {
            public readonly Box Panel,Preview,World,RotateLeft,RotateRight,PreviewLabel;
            public readonly bool ScrollHeader,ShowPreviewLabel;
            public Projection(Box panel,Box preview,Box world,Box left,Box right,Box label,bool scrollHeader,bool showLabel)
            {Panel=panel;Preview=preview;World=world;RotateLeft=left;RotateRight=right;PreviewLabel=label;ScrollHeader=scrollHeader;ShowPreviewLabel=showLabel;}
        }
        public static Projection Project(float width,float height)
        {
            if(float.IsNaN(width)||float.IsInfinity(width)||float.IsNaN(height)||float.IsInfinity(height)||width<280||height<142)
                throw new ArgumentOutOfRangeException("Appearance viewport must be finite and at least 280 by 142 pixels.");
            Box panel,preview;
            if(width<680&&height>=width*1.1f)
            {
                float previewHeight=Math.Min(300,Math.Max(148,height*.34f));
                preview=new Box(8,8,width-16,previewHeight);
                panel=new Box(8,preview.Bottom+8,width-16,height-preview.Bottom-16);
            }
            else
            {
                float panelWidth=Math.Min(400,Math.Max(240,width*.46f));
                // At narrow landscape sizes preserve a real preview alongside
                // the editor. All choices remain reachable by shared scrolling.
                panelWidth=Math.Min(panelWidth,width-120);
                panel=new Box(width-panelWidth-8,8,panelWidth,height-16);
                preview=new Box(8,8,panel.X-16,height-16);
            }
            bool label=preview.Height>=220&&preview.Width>=180;
            float labelHeight=label?32:0;
            var world=new Box(preview.X,preview.Y+labelHeight,preview.Width,preview.Height-labelHeight-52);
            float controlsLeft=preview.X+(preview.Width-96)/2;
            return new Projection(panel,preview,world,
                new Box(controlsLeft,preview.Bottom-44,44,44),new Box(controlsLeft+52,preview.Bottom-44,44,44),
                new Box(preview.X,preview.Y,preview.Width,28),panel.Height<360||panel.Width<320,label);
        }
    }
}
